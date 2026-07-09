"""Unified registry scrapers for the smaller certification associations.

Each registry follows a similar pattern: a directory page that's a JS-rendered
SPA where Local Scraper markdown-scrape (with wait + scroll) is the cheapest path
to the data. We then regex-parse the markdown for company entries.

ONE Local Scraper /scrape call per registry per cycle (or per state filter where
the directory needs it). Records yielded are deduped at the DB layer.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncIterator, Callable, Optional
from urllib.parse import urlparse

from db_async import VendorRecord, AsyncDB
from sources.parsers import find_email, find_phone, find_certifications, find_materials

log = logging.getLogger("registries")

# Match "City, ST" or "City, State Name" with a 2-letter state OR full state name.
LOC_RE = re.compile(
    r"\b([A-Z][A-Za-z .'\-]{2,28}),\s*([A-Z]{2}|"
    r"Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|"
    r"Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|"
    r"Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|"
    r"New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|"
    r"Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|"
    r"Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b"
)

URL_RE = re.compile(r"https?://[^\s)\]\"'<>]+")

# Companies almost always end in or contain one of these markers.
COMPANY_HINTS = re.compile(
    r"\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?|"
    r"Industries|Manufacturing|Mfg\.?|Fabrication|Fabricators?|Tank|Steel|"
    r"Vessels?|Heat Exchangers?|Conveyors?|Equipment|Systems?|Engineering|Group|"
    r"International|Solutions|Holdings|Products?|Technologies|Pipe|Welding|Boiler)\b",
    re.I,
)

SECTION_NOISE = {
    "filters","search","results","clear","sort","page","previous","next","back to top",
    "load more","show more","map view","grid view","list view","login","register",
    "member type","postal code","state/province","county/parish","country","city",
    "category","sub-category","keyword","apply filters","reset","contact","about",
    "home","find","directory","membership","members","footer","header","menu",
    "join","subscribe","privacy","terms","sitemap","navigation","skip","copyright",
    "all rights reserved","update profile","update company profile","print page",
    "share","view profile","read more","details","more info","click here",
    "services","products","facilities","capabilities",
    "skip to content","join now","how to join","clear filters","apply now",
    "an initiation fee","the qualifications","view cart","view all",
    "spfa pipe quality certification program","online store","help center",
    "log in","sign in","sign up","forgot password","an annual dues",
    "the company must","applicants must","the applicant must",
}

# Anything that looks like a street address: starts with digits + likely street word.
ADDRESS_LINE_RE = re.compile(
    r"^\s*\d{1,6}\s+[A-Za-z]+",
)
STREET_WORDS = re.compile(
    r"\b(?:St\.?|Ave\.?|Blvd\.?|Rd\.?|Hwy\.?|Drive|Lane|Suite|Ste\.?|Court|"
    r"Plaza|Parkway|Pkwy\.?|Circle|Cir\.?|Place|Pl\.?|Way|Road|Avenue|Boulevard|"
    r"Building|Bldg\.?|Floor|Unit|P\.?O\.?\s*Box)\b",
    re.I,
)
PHONE_FRAG = re.compile(r"\b\d{3}[\s.\-]\d{3,4}\b")
IMG_MD_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")
LINK_MD_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _is_company_name(s: str) -> bool:
    """Heuristic: looks like a company name, not chrome / nav text."""
    if not s:
        return False
    s = s.strip(" *#-•|·>:\"'")
    if len(s) < 4 or len(s) > 150:
        return False
    low = s.lower().strip()
    if low in SECTION_NOISE:
        return False
    # Reject if line is fully noise (case-insensitive subset check)
    for noise in SECTION_NOISE:
        if low == noise:
            return False
    # Reject address-looking lines (start with digits + street word)
    if ADDRESS_LINE_RE.match(s) and STREET_WORDS.search(s):
        return False
    # Reject if it's mostly digits (phone, postal, year)
    digits = sum(c.isdigit() for c in s)
    if digits > len(s) / 2:
        return False
    # Reject if it contains a phone fragment (those are contact lines)
    if PHONE_FRAG.search(s):
        return False
    # Must contain an uppercase letter and at least one space or company hint
    if not re.search(r"[A-Z]", s):
        return False
    if " " not in s and not COMPANY_HINTS.search(s) and "&" not in s:
        return False
    # Reject pure punctuation/markdown
    if re.fullmatch(r"[\W_]+", s):
        return False
    # Reject all-uppercase short instructional headers ("HOW TO JOIN")
    words = s.split()
    if len(words) <= 5 and s.upper() == s and not any(w.endswith(",") or w.endswith(".") for w in words):
        return False
    # Reject lines that start with verbs commonly used in marketing copy
    if re.match(r"^(?:An |The |Join |Become |Apply |Subscribe |Learn |Explore )", s, re.I):
        return False
    return True


def _extract_candidate(raw: str) -> tuple[str, Optional[str]]:
    """From a markdown line, return (best-guess company name, optional link).

    Handles:
      - `[Name](url)`
      - `![Name](image-url)` — image alt-text is often the company name
      - bare text with list/header decorators stripped
    """
    raw = raw.strip()
    # Image markdown FIRST (most common in directory cards)
    img = IMG_MD_RE.match(raw)
    if img:
        return img.group(1).strip(), None
    # Markdown link
    lnk = LINK_MD_RE.match(raw)
    if lnk:
        return lnk.group(1).strip(), lnk.group(2).strip()
    # Bare line with decorators
    cand = re.sub(r"^[#>*\-•\s|]+", "", raw).strip()
    # If a bare line contains an image+text combo, prefer the image alt
    img2 = IMG_MD_RE.search(cand)
    if img2 and img2.group(1).strip():
        return img2.group(1).strip(), None
    return cand, None


def _parse_directory_markdown(md: str, default_cert: str, source: str,
                              business_type: str = "Manufacturer") -> list[VendorRecord]:
    """Parse a Local Scraper markdown blob for company entries.

    Heuristic: walk every line; if a line looks like a company name AND the
    next ~6 lines contain a 'City, ST' location, emit a record. Optionally
    fold in nearby email/phone/website.
    """
    out: dict[str, VendorRecord] = {}
    lines = [l.rstrip() for l in md.splitlines() if l.strip()]
    n = len(lines)
    i = 0
    while i < n:
        cand, link = _extract_candidate(lines[i])
        if _is_company_name(cand) and cand not in out:
            # Tighten window: 5 lines after company name should hold contact info
            window = " \n ".join(lines[i + 1 : i + 6])
            loc_m = LOC_RE.search(window)
            location = f"{loc_m.group(1).strip()}, {loc_m.group(2)}" if loc_m else None
            email = find_email(window)
            phone = find_phone(window)
            website = link if (link and link.startswith("http") and "javascript" not in link) else None
            if not website:
                for u in URL_RE.findall(window):
                    host = (urlparse(u).hostname or "").lower()
                    if not host:
                        continue
                    # Skip self-references and image CDNs
                    if any(s in host for s in (source.lower().replace("-", ""),
                                                "tema.org", "cemanet", "stispfa",
                                                "heatexchange", "pemanet",
                                                "asme.org", "aisc.org",
                                                "noviams.com", "amazonaws",
                                                "wp.com", "gravatar")):
                        continue
                    website = u
                    break
            out[cand] = VendorRecord(
                company_name=cand,
                website_url=website,
                headquarters_location=location,
                contact_email=email,
                contact_phone=phone,
                certifications_held=[default_cert] if default_cert else [],
                primary_business_type=business_type,
                materials_handled=[],
                key_personnel=[],
                data_source=source,
            )
        i += 1
    # Retention-first: we already pre-seed each record with a certification
    # label and business type, so even a name-only capture has identifying
    # info. The DB layer's `has_any_identifier` guard catches true noise.
    return list(out.values())


class GenericRegistry:
    """A registry source defined by a single directory URL + a default cert label.

    For sites with internal pagination, pass `paginated_urls` (a list of URLs)
    instead of `url`. For SPAs that need user-interaction (e.g. clicking a
    'Search' button) pass `wait_ms` and `scroll`.
    """

    def __init__(
        self,
        name: str,
        html_scrape: Callable,  # async (url, wait_ms, scroll) -> markdown
        urls: list[str],
        default_cert: str,
        business_type: str = "Manufacturer",
        wait_ms: int = 4000,
        scroll: bool = True,
        materials_seed: Optional[list[str]] = None,
    ):
        self.name = name
        self.html_scrape = html_scrape
        self.urls = urls
        self.default_cert = default_cert
        self.business_type = business_type
        self.wait_ms = wait_ms
        self.scroll = scroll
        self.materials_seed = materials_seed or []

    async def discover(self) -> AsyncIterator[VendorRecord]:
        for url in self.urls:
            log.info("[%s] scraping %s", self.name, url)
            md = await self.html_scrape(url, wait_ms=self.wait_ms, scroll=self.scroll)
            if not md:
                log.warning("[%s] empty markdown for %s", self.name, url)
                continue
            records = _parse_directory_markdown(
                md, default_cert=self.default_cert, source=self.name,
                business_type=self.business_type,
            )
            for r in records:
                if self.materials_seed:
                    r.materials_handled = list(self.materials_seed)
                yield r
            log.info("[%s] %s -> %d records", self.name, url, len(records))


def build_all_registries(html_scrape) -> list[GenericRegistry]:
    """Configure every supported certification-association directory."""
    fc = html_scrape
    return [
        GenericRegistry(
            "TEMA", fc,
            urls=["https://www.tema.org/members/"],
            default_cert="TEMA Member",
            business_type="Heat Exchanger Manufacturer",
            materials_seed=["Carbon Steel", "Stainless Steel"],
            wait_ms=5000, scroll=True,
        ),
        # CEMA is handled by sources.cema_wp via the WP REST API — no
        # Local Scraper credit needed. The orchestrator wires that source separately.
        GenericRegistry(
            "PEMA", fc,
            urls=["https://pemanet.org/members/"],
            default_cert="PEMA Member",
            business_type="Process Equipment Manufacturer",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "HEI", fc,
            urls=["https://www.heatexchange.org/members/"],
            default_cert="HEI Member",
            business_type="Heat Exchange Manufacturer",
            materials_seed=["Carbon Steel", "Stainless Steel"],
            wait_ms=6000, scroll=True,
        ),
        GenericRegistry(
            "STI-SPFA", fc,
            urls=[
                "https://members.stispfa.org/directory",
                "https://members.stispfa.org/directory?page=2",
                "https://members.stispfa.org/directory?page=3",
                "https://members.stispfa.org/directory?page=4",
            ],
            default_cert="STI/SPFA Member",
            business_type="Steel Tank / Pipe Fabricator",
            materials_seed=["Carbon Steel", "Steel"],
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "AWS", fc,
            urls=["https://app.aws.org/cert/registries/companies"],
            default_cert="AWS Certified",
            business_type="Welding Fabricator",
            wait_ms=7000, scroll=True,
        ),
        GenericRegistry(
            "NBIC-R-Stamp", fc,
            urls=["https://www.nationalboard.org/SearchCertificate.aspx?Stamp=R"],
            default_cert="NBIC R Stamp",
            business_type="Pressure Equipment Repair",
            wait_ms=6000, scroll=True,
        ),
        GenericRegistry(
            "ASME-CACONNECT", fc,
            urls=[
                "https://caconnect.asme.org/",
            ],
            default_cert="ASME Certified",
            business_type="Pressure Equipment Manufacturer",
            wait_ms=7000, scroll=True,
        ),
        # --- Expanded registries (Phase 4) ---
        GenericRegistry(
            "NBIC-VR-Stamp", fc,
            urls=["https://www.nationalboard.org/SearchCertificate.aspx?Stamp=VR"],
            default_cert="NBIC VR Stamp",
            business_type="Pressure Relief Valve Repair",
            wait_ms=6000, scroll=True,
        ),
        GenericRegistry(
            "NBIC-NR-Stamp", fc,
            urls=["https://www.nationalboard.org/SearchCertificate.aspx?Stamp=NR"],
            default_cert="NBIC NR Stamp",
            business_type="Nuclear Component Repair",
            wait_ms=6000, scroll=True,
        ),
        GenericRegistry(
            "NOMMA", fc,
            urls=["https://nomma.org/member-directory/"],
            default_cert="NOMMA Member",
            business_type="Ornamental Metal Fabricator",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "NTMA", fc,
            urls=["https://ntma.org/find-a-manufacturer/"],
            default_cert="NTMA Member",
            business_type="Precision Machine Shop",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "FMA", fc,
            urls=["https://www.fmanet.org/membership-directory"],
            default_cert="FMA Member",
            business_type="Metal Fabricator",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "SMACNA", fc,
            urls=["https://www.smacna.org/find-a-contractor"],
            default_cert="SMACNA Member",
            business_type="Sheet Metal / HVAC Contractor",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "MHI", fc,
            urls=["https://www.mhi.org/member-directory"],
            default_cert="MHI Member",
            business_type="Material Handling Equipment",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "AMPP", fc,
            urls=["https://ampp.org/membership/find-a-member"],
            default_cert="AMPP Member",
            business_type="Corrosion/Coatings Contractor",
            wait_ms=5000, scroll=True,
        ),
        GenericRegistry(
            "CWB", fc,
            urls=["https://www.cwbgroup.org/certified-companies"],
            default_cert="CWB Certified",
            business_type="Welding Fabricator",
            wait_ms=6000, scroll=True,
        ),
        GenericRegistry(
            "API-CompList", fc,
            urls=["https://www.api.org/products-and-services/api-monogram-and-apiqr/api-composite-list/api-composite-list"],
            default_cert="API Licensed",
            business_type="Oil & Gas Equipment Manufacturer",
            wait_ms=7000, scroll=True,
        ),
    ]
