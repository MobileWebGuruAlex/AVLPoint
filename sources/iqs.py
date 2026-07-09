"""IQS Directory free-tier industrial company scraper (zero Local Scraper cost).

IQS Directory publishes "Leading Companies" blocks as static HTML on every
category landing page. Each entry follows the pattern:

    {Company Name} {City}, {ST} {Phone}

We pull as many categories as we know about, parse the text, and emit
VendorRecords with name + location + phone — high-quality partial records
ready for further enrichment.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncIterator, Optional

import aiohttp

from db_async import VendorRecord

log = logging.getLogger("iqs")

BASE = "https://www.iqsdirectory.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Each tuple: (category-slug, default-cert label, business type, materials seed)
# NOTE: IQS is a category directory, NOT a certification registry. We do NOT
# assign speculative cert labels — the business_type carries the industry signal.
CATEGORIES = [
    ("pressure-vessels", "", "Pressure Vessel Manufacturer", ["Carbon Steel", "Stainless Steel"]),
    ("heat-exchangers", "", "Heat Exchanger Manufacturer", ["Carbon Steel", "Stainless Steel"]),
    ("tanks", "", "Tank Fabricator", ["Carbon Steel", "Stainless Steel"]),
    ("steel-fabrication", "", "Steel Fabricator", ["Carbon Steel"]),
    ("conveyors", "", "Conveyor Equipment Manufacturer", []),
    ("metal-fabrication", "", "Metal Fabricator", []),
    ("storage-tanks", "", "Storage Tank Fabricator", ["Carbon Steel"]),
    ("welding", "", "Welding Services", []),
    ("custom-metal-fabrication", "", "Custom Metal Fabricator", []),
    ("boilers", "", "Boiler Manufacturer", []),
    # --- expanded categories ---
    ("pipe-fabrication", "", "Pipe Fabricator", ["Carbon Steel", "Stainless Steel"]),
    ("structural-steel-fabrication", "", "Structural Steel Fabricator", ["Carbon Steel"]),
    ("machining-services", "", "Machine Shop", []),
    ("cnc-machining", "", "CNC Machine Shop", []),
    ("sheet-metal-fabrication", "", "Sheet Metal Fabricator", []),
    ("stainless-steel-fabrication", "", "Stainless Steel Fabricator", ["Stainless Steel"]),
    ("aluminum-fabrication", "", "Aluminum Fabricator", ["Aluminum"]),
    ("laser-cutting", "", "Laser Cutting Services", []),
    ("plasma-cutting", "", "Plasma Cutting Services", []),
    ("waterjet-cutting", "", "Waterjet Cutting Services", []),
    ("tube-bending", "", "Tube Bending Services", []),
    ("roll-forming", "", "Roll Forming", []),
    ("industrial-coatings", "", "Industrial Coatings", []),
    ("sandblasting", "", "Sandblasting Services", []),
    ("powder-coating", "", "Powder Coating Services", []),
    ("metal-stamping", "", "Metal Stamping", []),
    ("forging", "", "Forging", ["Carbon Steel", "Alloy Steel"]),
    ("casting", "", "Casting", []),
    ("plate-rolling", "", "Plate Rolling Services", ["Carbon Steel"]),
    ("industrial-piping", "", "Industrial Piping Contractor", []),
    ("valve-manufacturers", "", "Valve Manufacturer", []),
    ("flange-manufacturers", "", "Flange Manufacturer", []),
]

# Pattern: "<Company Suffix> <City>, <ST> <phone>"
# Suffix-anchored so we don't match generic prose; greedy but bounded.
ENTRY_RE = re.compile(
    r"([A-Z][A-Za-z0-9&.,'\-\s]{2,70}?"
    r"(?:Inc\.?|LLC|Corp(?:oration)?\.?|Co\.?|Ltd\.?|Company|Industries|"
    r"Manufacturing|Mfg\.?|Group|International|Solutions|Equipment|"
    r"Fabricators?|Fabrication|Systems?|Engineering|Products?|Services))"
    r"\s+([A-Z][a-zA-Z .']{2,30}),\s*([A-Z]{2})\s+"
    r"((?:\+?1[-\s.]?)?(?:\(\d{3}\)|\d{3})[-\s.]?\d{3}[-\s.]?\d{4})"
)

# Junk prefixes to strip from captured names. Repeated so chained noise like
# "Read Reviews Request For Quote Acme Inc" reduces to "Acme Inc".
_NOISE_TOKENS = (
    "Read Reviews", "Request For Quote", "Request For Information",
    "Leading Companies", "View Company Profile", "Reviews",
    "For Quote", "For Information", "Save This Company",
    "Get Quote", "View Profile",
)
PREFIX_NOISE_RE = re.compile(
    r"^(?:\s*(?:" + "|".join(re.escape(t) for t in _NOISE_TOKENS) + r")[:.\s]+)+",
    re.I,
)


async def _fetch(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
            if r.status >= 400:
                return None
            return await r.text(errors="replace")
    except Exception:
        return None


def _strip_tags(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", html)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_entries(text: str, cert: str, btype: str, materials: list[str]) -> list[VendorRecord]:
    seen = set()
    out: list[VendorRecord] = []
    for m in ENTRY_RE.finditer(text):
        name = PREFIX_NOISE_RE.sub("", m.group(1).strip())
        name = re.sub(r"\s+", " ", name).strip(" ,.-")
        if not name or name.lower() in seen:
            continue
        if len(name) < 4 or len(name) > 120:
            continue
        seen.add(name.lower())
        out.append(VendorRecord(
            company_name=name,
            headquarters_location=f"{m.group(2).strip()}, {m.group(3)}",
            contact_phone=m.group(4).strip(),
            contact_email=None,
            website_url=None,
            certifications_held=[cert] if cert else [],
            primary_business_type=btype,
            materials_handled=list(materials),
            key_personnel=[],
            year_established=None,
            thomasnet_profile_url=None,
            data_source=f"IQS:{m.group(0)[:0]}",  # placeholder filled below
        ))
    return out


class IQSSource:
    name = "IQS"

    def __init__(self, *args, **_):
        pass

    async def discover(self) -> AsyncIterator[VendorRecord]:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            for slug, cert, btype, materials in CATEGORIES:
                url = f"{BASE}/{slug}/"
                html = await _fetch(session, url)
                if not html:
                    log.warning("IQS: failed to fetch %s", url)
                    continue
                text = _strip_tags(html)
                records = _parse_entries(text, cert, btype, materials)
                for r in records:
                    r.data_source = f"IQS:{slug}"
                    yield r
                log.info("IQS %s -> %d records", slug, len(records))
