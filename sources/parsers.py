"""Lightweight HTML/markdown field extractors.

Cheap regex/CSS scrapes that recover ~80% of fields without any LLM call.
Used by both the discovery layer and the post-Local Scraper markdown pass.
"""
from __future__ import annotations

import re
from typing import Optional

from selectolax.parser import HTMLParser

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
OBFUSCATED_EMAIL_RE = re.compile(
    r"([A-Za-z0-9._%+-]+)\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|@|at|\[@\])\s*([A-Za-z0-9.-]+)\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\.|dot|\[\.\])\s*([A-Za-z]{2,})",
    re.I
)
PHONE_RE = re.compile(
    r"(?:(?:\+|00)\d{1,4}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{3,4})?"
)
SQFT_RE = re.compile(r"([\d,]{3,})\s*(?:sq\.?\s*ft|square\s*feet|sqft|m²|sq\.?\s*m|square\s*meters|m2)", re.I)
YEAR_FOUNDED_RE = re.compile(
    r"(?:est\.|established|founded|since|history\s*since|gegründet|fondée|fondata|fundada|seit|depuis)[^\d]{0,20}((?:18|19|20)\d{2})",
    re.I
)

CERTIFICATION_PATTERNS = {
    "ASME U": r"\bASME\s*[\-\s]?U\b(?!2)",
    "ASME U2": r"\bASME\s*[\-\s]?U2\b",
    "ASME S": r"\bASME\s*[\-\s]?S\b(?!T)",
    "ASME R": r"\bASME\s*[\-\s]?R\b(?!T)",
    "ASME PP": r"\bASME\s*[\-\s]?PP\b",
    "ASME RTP-1": r"\bASME\s*RTP[\-\s]?1\b",
    "ASME NB": r"\bNational\s+Board\b|\b\"NB\"\b",
    "API 650": r"\bAPI\s*650\b",
    "API 620": r"\bAPI\s*620\b",
    "API 510": r"\bAPI\s*510\b",
    "AWS D1.1": r"\bAWS\s*D1\.1\b",
    "AWS D1.5": r"\bAWS\s*D1\.5\b",
    "AISC Certified Building Fabricator": r"\bAISC\b.{0,40}\b(?:Building|BU|Certified)\b",
    "AISC Bridge Fabricator": r"\bAISC\b.{0,40}\bBridge\b",
    "ISO 9001": r"\bISO\s*9001\b",
    "ISO 14001": r"\bISO\s*14001\b",
    "ISO 45001": r"\bISO\s*45001\b",
    "ISO 3834": r"\bISO\s*3834\b",
    "PED": r"\bPED\b.{0,30}\b(?:2014/68|Module)\b|\bPressure\s+Equipment\s+Directive\b",
    "CRN": r"\bCRN\b.{0,20}\b(?:registration|registered)\b",
    "CE Mark": r"\bCE\s*Mark(?:ing)?\b|\bConformité\s+Européenne\b",
    "EN 1090": r"\bEN\s*1090\b",
    "EN 13445": r"\bEN\s*13445\b",
    "DIN": r"\bDIN\s*EN\b",
    "JIS": r"\bJIS\s*[A-Z]?\d+\b",
    "AS/NZS": r"\bAS/NZS\b",
    "TUV": r"\bTÜV\b|\bTUV\s*Rheinland\b|\bTUV\s*SUD\b",
}

MATERIAL_KEYWORDS = [
    "Carbon Steel", "Stainless Steel", "Titanium", "Aluminum", "Hastelloy",
    "Inconel", "Monel", "Nickel", "Duplex", "Super Duplex", "Copper",
    "Brass", "Bronze", "Zirconium", "Tantalum", "Alloy Steel", "FRP",
    "Fiberglass", "Plastic", "Cast Iron",
]

BUSINESS_TYPE_HINTS = {
    "Fabricator": ["fabricator", "fabrication", "metal fab"],
    "Manufacturer": ["manufacturer", "manufacturing", "OEM"],
    "Inspector": ["inspection services", "third-party inspect"],
    "Field Service": ["field service", "on-site service", "field machining"],
    "Distributor": ["distributor", "stocking"],
}


def text_only(html_or_md: str) -> str:
    if "<" in html_or_md and ">" in html_or_md:
        try:
            return HTMLParser(html_or_md).text(separator=" ")
        except Exception:
            return html_or_md
    return html_or_md


def find_email(text: str) -> Optional[str]:
    if not text:
        return None
    for m in EMAIL_RE.finditer(text):
        e = m.group(0).lower()
        if any(skip in e for skip in ("example.", "sentry", "wixpress", ".png", ".jpg")):
            continue
        return e
    for m in OBFUSCATED_EMAIL_RE.finditer(text):
        e = f"{m.group(1)}@{m.group(2)}.{m.group(3)}".lower()
        if any(skip in e for skip in ("example.", "sentry", "wixpress", ".png", ".jpg")):
            continue
        return e
    return None


def find_phone(text: str) -> Optional[str]:
    if not text:
        return None
    for m in PHONE_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 8 <= len(digits) <= 15:
            return m.group(0).strip()
    return None


def find_facility_size(text: str) -> Optional[str]:
    if not text:
        return None
    m = SQFT_RE.search(text)
    return f"{m.group(1)} sq ft" if m else None


def find_year_established(text: str) -> Optional[str]:
    if not text:
        return None
    m = YEAR_FOUNDED_RE.search(text)
    if m:
        y = int(m.group(1))
        if 1700 <= y <= 2099:
            return str(y)
    return None


def find_certifications(text: str) -> list[str]:
    if not text:
        return []
    found = []
    for label, pat in CERTIFICATION_PATTERNS.items():
        if re.search(pat, text, re.I):
            found.append(label)
    return found


def find_materials(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [m for m in MATERIAL_KEYWORDS if m.lower() in low]


def infer_business_type(text: str) -> Optional[str]:
    if not text:
        return None
    low = text.lower()
    for bt, hints in BUSINESS_TYPE_HINTS.items():
        if any(h in low for h in hints):
            return bt
    return None


US_STATES = (
    "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|"
    "MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY"
)

CITY_STATE_RE = re.compile(
    r"\b([A-Z][A-Za-z .'\-]{2,28}),\s*"
    rf"({US_STATES})\b"
)

# Full US address: 123 Main St, City, ST 12345
FULL_ADDRESS_RE = re.compile(
    rf"(\d+[\w\s.,#/-]{{5,60}}),\s*"
    rf"([A-Z][A-Za-z .'-]{{2,28}}),\s*"
    rf"({US_STATES})\s+"
    rf"(\d{{5}}(?:-\d{{4}})?)\b"
)

# Street address line pattern (123 Main Street, P.O. Box 123, etc.)
STREET_RE = re.compile(
    r"\b(\d+\s+[A-Z][A-Za-z0-9 .,#/-]{5,55}(?:Street|St|Avenue|Ave|Boulevard|Blvd|"
    r"Road|Rd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct|Parkway|Pkwy|Circle|Cir|"
    r"Highway|Hwy|Suite|Ste|Unit)[.,]?)\b",
    re.I,
)

PO_BOX_RE = re.compile(
    r"\b(P\.?\s*O\.?\s*Box\s+\d+)\b", re.I,
)

ZIP_RE = re.compile(
    rf"({US_STATES})\s+(\d{{5}}(?:-\d{{4}})?)\b"
)

# International Country Fallback
INTERNATIONAL_COUNTRY_RE = re.compile(
    r"\b(United Kingdom|Germany|France|Italy|Spain|Netherlands|Belgium|Poland|"
    r"Sweden|Norway|Finland|Denmark|Switzerland|Austria|Ireland|"
    r"Canada|Mexico|Brazil|Argentina|Chile|Colombia|"
    r"Australia|New Zealand|Japan|South Korea|India|China|Taiwan|Vietnam|Malaysia|Singapore|"
    r"United Arab Emirates|Saudi Arabia|South Africa|Turkey|Egypt)\b$", re.I | re.M
)


def find_location(text: str):
    if not text:
        return None
    m = CITY_STATE_RE.search(text)
    return f"{m.group(1).strip()}, {m.group(2)}" if m else None


def find_structured_address(text: str) -> dict:
    """Extract street_address, city, state_province, zip_postal_code from text."""
    out = {}
    if not text:
        return out

    # Try full address first (most reliable)
    m = FULL_ADDRESS_RE.search(text)
    if m:
        out["street_address"] = m.group(1).strip().rstrip(",")
        out["city"] = m.group(2).strip()
        out["state_province"] = m.group(3).strip()
        out["zip_postal_code"] = m.group(4).strip()
        out["country"] = "US"
        return out

    # Try street + city/state/zip separately
    street_m = STREET_RE.search(text) or PO_BOX_RE.search(text)
    city_m = CITY_STATE_RE.search(text)
    zip_m = ZIP_RE.search(text)
    intl_m = INTERNATIONAL_COUNTRY_RE.search(text)

    if street_m:
        out["street_address"] = street_m.group(1).strip().rstrip(",")
    if city_m:
        out["city"] = city_m.group(1).strip()
        out["state_province"] = city_m.group(2).strip()
    if zip_m:
        if "state_province" not in out:
            out["state_province"] = zip_m.group(1).strip()
        out["zip_postal_code"] = zip_m.group(2).strip()
    
    if intl_m and "country" not in out:
        out["country"] = intl_m.group(1).title()
    elif out and "country" not in out:
        out["country"] = "US"
        
    return out


import json as _json


def _find_jsonld_blocks(blob: str) -> list[dict]:
    """Pull every JSON-LD <script> payload out of HTML or raw markdown."""
    out = []
    if not blob:
        return out
    for m in re.finditer(
        r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.+?)</script>",
        blob, flags=re.S | re.I,
    ):
        raw = m.group(1).strip()
        try:
            data = _json.loads(raw)
        except Exception:
            continue
        if isinstance(data, list):
            out.extend(d for d in data if isinstance(d, dict))
        elif isinstance(data, dict):
            # Some sites nest under @graph
            graph = data.get("@graph") if isinstance(data.get("@graph"), list) else None
            if graph:
                out.extend(d for d in graph if isinstance(d, dict))
            else:
                out.append(data)
    return out


TEL_LINK_RE = re.compile(r"""(?:href|content|value)=["'](?:tel|callto):([^"']+)["']""", re.I)
MAILTO_LINK_RE = re.compile(r"""<a[^>]+href=["']mailto:([^"'?]+)""", re.I)
ADDRESS_TAG_RE = re.compile(r"<address[^>]*>(.+?)</address>", re.I | re.S)
FOOTER_PHONE_RE = re.compile(
    r"(?:Phone|Tel(?:ephone)?|Call|Main|Office)[:.\s]*([+\d][\d\s().\-]{7,20}\d)", re.I,
)
FOOTER_EMAIL_RE = re.compile(
    r"(?:Email|E-?mail|Contact)[:.\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})",
    re.I,
)


def _extract_link_fields(blob: str) -> dict:
    """Pull contact info from tel:/mailto:/footer-labelled patterns."""
    out = {}
    if not blob:
        return out
    # tel: links — most reliable signal on any modern site
    tel_match = TEL_LINK_RE.search(blob)
    if tel_match:
        tel = tel_match.group(1).strip()
        # Strip parens/spaces/dashes-only chars but keep + and digits
        cleaned = re.sub(r"[^\d+]", "", tel)
        if 7 <= len(re.sub(r"\D", "", cleaned)) <= 15:
            out["contact_phone"] = tel
    # mailto: links
    em_match = MAILTO_LINK_RE.search(blob)
    if em_match:
        em = em_match.group(1).strip().lower()
        if "@" in em and "example" not in em and "sentry" not in em:
            out["contact_email"] = em
    # <address> tag — usually carries the HQ address
    addr_match = ADDRESS_TAG_RE.search(blob)
    if addr_match:
        addr_text = re.sub(r"<[^>]+>", " ", addr_match.group(1))
        addr_text = re.sub(r"\s+", " ", addr_text).strip()
        loc = find_location(addr_text)
        if loc:
            out["headquarters_location"] = loc
        # Also extract structured address from <address> tag
        addr_parts = find_structured_address(addr_text)
        for k, v in addr_parts.items():
            if v:
                out[k] = v
    # Footer-style labelled lines
    if "contact_phone" not in out:
        m = FOOTER_PHONE_RE.search(blob)
        if m:
            out["contact_phone"] = m.group(1).strip()
    if "contact_email" not in out:
        m = FOOTER_EMAIL_RE.search(blob)
        if m:
            out["contact_email"] = m.group(1).strip().lower()
    return out


def _extract_jsonld_fields(blob: str) -> dict:
    """Mine JSON-LD for Organization/LocalBusiness contact data."""
    out = {}
    blocks = _find_jsonld_blocks(blob)
    if not blocks:
        return out
    org = None
    for b in blocks:
        t = b.get("@type")
        types = [t] if isinstance(t, str) else (t if isinstance(t, list) else [])
        if any(s in {"Organization", "Corporation", "LocalBusiness",
                     "GeneralContractor", "Manufacturer", "ProfessionalService"}
               for s in types):
            org = b
            break
    if not org:
        org = blocks[0]
    if not isinstance(org, dict):
        return out
    # telephone
    tel = org.get("telephone")
    if isinstance(tel, list) and tel:
        tel = tel[0]
    if isinstance(tel, str) and tel.strip():
        out["contact_phone"] = tel.strip()
    # email
    em = org.get("email")
    if isinstance(em, list) and em:
        em = em[0]
    if isinstance(em, str) and em.strip() and "@" in em:
        out["contact_email"] = em.strip().lower().replace("mailto:", "")
    # address — extract both structured fields and headquarters_location
    addr = org.get("address")
    if isinstance(addr, list) and addr:
        addr = addr[0]
    if isinstance(addr, dict):
        street = addr.get("streetAddress")
        city = addr.get("addressLocality") or addr.get("addressLocality ")
        region = addr.get("addressRegion")
        postal = addr.get("postalCode")
        country = addr.get("addressCountry")
        if isinstance(country, dict):
            country = country.get("name")
        # Structured fields
        if isinstance(street, str) and street.strip():
            out["street_address"] = street.strip()
        if isinstance(city, str) and city.strip():
            out["city"] = city.strip()
        if isinstance(region, str) and region.strip():
            out["state_province"] = region.strip()
        if isinstance(postal, str) and postal.strip():
            out["zip_postal_code"] = postal.strip()
        if isinstance(country, str) and country.strip():
            out["country"] = country.strip()
        loc_parts = [p for p in (city, region, country) if isinstance(p, str) and p.strip()]
        if loc_parts:
            out["headquarters_location"] = ", ".join(p.strip() for p in loc_parts)
    # founding date
    fd = org.get("foundingDate") or org.get("foundingYear")
    if isinstance(fd, str):
        ym = re.search(r"(\d{4})", fd)
        if ym:
            out["year_established"] = ym.group(1)
    # website url (sometimes embedded as "url" on Organization)
    web = org.get("url")
    if isinstance(web, str) and web.startswith("http"):
        out["website_url"] = web
    return out


def parse_profile_markdown(md: str) -> dict:
    """Extract structured fields from a Local Scraper markdown blob or raw HTML.

    Layered: try JSON-LD first (most reliable on B2B sites), then fall back
    to regex over the visible text.
    """
    if not md:
        return {}
    text = text_only(md)
    out = {
        "contact_email": find_email(text),
        "contact_phone": find_phone(text),
        "facility_size_sqft": find_facility_size(text),
        "year_established": find_year_established(text),
        "certifications_held": find_certifications(text),
        "materials_handled": find_materials(text),
        "primary_business_type": infer_business_type(text),
        "headquarters_location": find_location(text),
        "welding_processes": find_welding_processes(text),
        "services": find_services(text),
        "capabilities": find_capabilities(text),
        "industries_served": find_industries(text),
        "social_profiles": find_social_profiles(md),
        "logo_url": find_logo_url(md),
        "employee_count": find_employee_count(text),
        "company_description": find_description(md),
    }
    # Structured address extraction from visible text
    addr_parts = find_structured_address(text)
    for k, v in addr_parts.items():
        if v:
            out[k] = v
    # Layered upgrade: regex over visible text < HTML link/address tags < JSON-LD.
    for k, v in _extract_link_fields(md).items():
        if v:
            out[k] = v
    for k, v in _extract_jsonld_fields(md).items():
        if v:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
#  Extended field extractors (Phase 6)
# ---------------------------------------------------------------------------

WELDING_PROCESS_PATTERNS = {
    "GMAW (MIG)": r"\bGMAW\b|\bMIG\b",
    "GTAW (TIG)": r"\bGTAW\b|\bTIG\b",
    "SMAW (Stick)": r"\bSMAW\b|\bstick\s*weld",
    "FCAW": r"\bFCAW\b",
    "SAW (Submerged Arc)": r"\bSAW\b|\bsubmerged\s+arc\b",
    "Resistance Welding": r"\bresistance\s+weld",
    "Flux Core": r"\bflux[\s-]core\b",
    "Orbital Welding": r"\borbital\s+weld",
    "Laser Welding": r"\blaser\s+weld",
    "Electron Beam Welding": r"\belectron\s+beam\b",
    "Robotic Welding": r"\brobotic\s+weld",
    "Stud Welding": r"\bstud\s+weld",
    "Spot Welding": r"\bspot\s+weld",
    "Brazing": r"\bbraz(?:ing|e)\b",
    "Soldering": r"\bsolder(?:ing)?\b",
}


def find_welding_processes(text: str) -> list[str]:
    if not text:
        return []
    found = []
    for label, pat in WELDING_PROCESS_PATTERNS.items():
        if re.search(pat, text, re.I):
            found.append(label)
    return found


SERVICE_KEYWORDS = [
    "Custom Fabrication", "Precision Machining", "CNC Machining",
    "Welding Services", "Pipe Fabrication", "Structural Steel",
    "Metal Forming", "Sheet Metal", "Plate Rolling", "Heat Treatment",
    "Non-Destructive Testing", "NDT", "Quality Control",
    "Field Erection", "Field Services", "On-site Welding",
    "Hydrostatic Testing", "Pressure Testing", "Stress Relieving",
    "Sand Blasting", "Shot Blasting", "Painting", "Coating",
    "Powder Coating", "Galvanizing", "Design Engineering",
    "Project Management", "Maintenance", "Repair", "Overhaul",
    "Emergency Repair", "Shutdown Services", "Turnaround Services",
    "Installation", "Commissioning", "Decommissioning",
    "Laser Cutting", "Plasma Cutting", "Waterjet Cutting",
    "Oxy-Fuel Cutting", "Flame Cutting", "Tube Bending",
    "Roll Forming", "Press Brake", "Punching", "Shearing",
    "Drilling", "Boring", "Turning", "Milling", "Grinding",
]


def find_services(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [s for s in SERVICE_KEYWORDS if s.lower() in low]


CAPABILITY_KEYWORDS = [
    "ASME Code Fabrication", "Pressure Vessel Fabrication",
    "Heat Exchanger Fabrication", "Storage Tank Fabrication",
    "Process Equipment", "Structural Steel Fabrication",
    "Pipe Spool Fabrication", "Module Fabrication",
    "Skid Fabrication", "Custom Metal Fabrication",
    "Heavy Plate Fabrication", "Stainless Steel Fabrication",
    "Alloy Fabrication", "Titanium Fabrication",
    "Large Diameter Piping", "High Pressure Piping",
]


def find_capabilities(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [c for c in CAPABILITY_KEYWORDS if c.lower() in low]


INDUSTRY_KEYWORDS = [
    "Oil & Gas", "Petrochemical", "Refining", "Chemical",
    "Power Generation", "Nuclear", "Pharmaceutical", "Biotech",
    "Food & Beverage", "Pulp & Paper", "Mining", "Water Treatment",
    "Wastewater", "HVAC", "Marine", "Aerospace", "Defense",
    "Automotive", "Agriculture", "Construction", "Infrastructure",
    "Renewable Energy", "Solar", "Wind", "LNG", "Natural Gas",
    "Pipeline", "Steel", "Metals", "Semiconductor",
]


def find_industries(text: str) -> list[str]:
    if not text:
        return []
    low = text.lower()
    return [i for i in INDUSTRY_KEYWORDS if i.lower() in low]


SOCIAL_RE = {
    "linkedin": re.compile(r"https?://(?:www\.)?linkedin\.com/company/[\w\-]+", re.I),
    "facebook": re.compile(r"https?://(?:www\.)?facebook\.com/[\w\.\-]+", re.I),
    "twitter": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/[\w]+", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:c/|channel/|@)[\w\-]+", re.I),
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/[\w\.\-]+", re.I),
}


def find_social_profiles(text: str) -> Optional[str]:
    """Return JSON string of social profile URLs found in text."""
    if not text:
        return None
    profiles = {}
    for platform, pattern in SOCIAL_RE.items():
        m = pattern.search(text)
        if m:
            profiles[platform] = m.group(0)
    return _json.dumps(profiles) if profiles else None


LOGO_RE = re.compile(
    r'(?:href|src)=["\']([^"\']+?logo[^"\']*\.(?:png|jpg|jpeg|svg|webp))["\']',
    re.I,
)
OG_IMAGE_RE = re.compile(
    r'<meta\s+property=["\']og:image["\'].*?content=["\']([^"\']+)["\']',
    re.I,
)
FAVICON_RE = re.compile(
    r'<link[^>]+rel=["\'](?:icon|shortcut icon|apple-touch-icon)["\'][^>]+href=["\']([^"\']+)["\']',
    re.I,
)


def find_logo_url(text: str) -> Optional[str]:
    if not text:
        return None
    m = LOGO_RE.search(text)
    if m:
        return m.group(1)
    m = OG_IMAGE_RE.search(text)
    if m:
        return m.group(1)
    m = FAVICON_RE.search(text)
    if m:
        return m.group(1)
    return None


EMPLOYEE_RE = re.compile(
    r"(?:(\d[\d,]+)\s*(?:\+\s*)?employees?\b)|"
    r"(?:workforce\s+of\s+(\d[\d,]+))|"
    r"(?:(?:team|staff)\s+of\s+(?:over\s+)?(\d[\d,]+))|"
    r"(?:(\d[\d,]+)\s*-\s*\d[\d,]*\s*employees?)",
    re.I,
)


def find_employee_count(text: str) -> Optional[str]:
    if not text:
        return None
    m = EMPLOYEE_RE.search(text)
    if m:
        for g in m.groups():
            if g:
                return g.replace(",", "")
    return None


META_DESC_RE = re.compile(
    r'<meta\s+name=["\']description["\'].*?content=["\']([^"\']{20,500})["\']',
    re.I,
)
OG_DESC_RE = re.compile(
    r'<meta\s+property=["\']og:description["\'].*?content=["\']([^"\']{20,500})["\']',
    re.I,
)


def find_description(text: str) -> Optional[str]:
    if not text:
        return None
    m = OG_DESC_RE.search(text)
    if m:
        return m.group(1).strip()
    m = META_DESC_RE.search(text)
    if m:
        return m.group(1).strip()
    return None

