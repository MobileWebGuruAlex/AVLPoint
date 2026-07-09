"""CEMA member directory via WordPress REST API — zero Local Scraper credits.

CEMA exposes every certified member as a WordPress page with slug prefix
`profile-<company-slug>`. We paginate the public `/wp-json/wp/v2/pages?search=profile`
endpoint and parse each profile's HTML for company name + outgoing website link.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

import aiohttp

from db_async import VendorRecord
from sources.parsers import find_email, find_phone, find_facility_size, find_materials

log = logging.getLogger("cema-wp")

API = "https://www.cemanet.org/wp-json/wp/v2/pages"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0",
    "Accept": "application/json",
}

LOC_RE = re.compile(
    r"\b([A-Z][A-Za-z .'\-]{2,28}),\s*"
    r"(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|"
    r"MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b"
)


def _clean_title(t: str) -> Optional[str]:
    if not t:
        return None
    t = html.unescape(t).strip()
    # Remove "Profile - " / "Profile – " / "Profile — " prefix
    t = re.sub(r"^\s*Profile\s*[-–—]\s*", "", t, flags=re.I)
    return t.strip() or None


def _strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def _extract_website(content_html: str, exclude_hosts: list[str]) -> Optional[str]:
    """Find the first outgoing link that isn't a CEMA/CDN host."""
    for m in re.finditer(r'href=["\'](https?://[^"\']+)["\']', content_html or ""):
        url = m.group(1)
        host = (urlparse(url).hostname or "").lower()
        if not host:
            continue
        if any(skip in host for skip in exclude_hosts):
            continue
        if any(host.endswith(ext) for ext in (".png", ".jpg", ".gif", ".svg")):
            continue
        return url
    return None


async def _fetch_page(session: aiohttp.ClientSession, page: int) -> list[dict]:
    params = {"search": "profile", "per_page": "100", "page": str(page)}
    try:
        async with session.get(API, params=params, timeout=aiohttp.ClientTimeout(total=30)) as r:
            if r.status >= 400:
                return []
            return await r.json()
    except Exception as e:
        log.warning("CEMA wp-json page %d failed: %s", page, e)
        return []


class CEMASource:
    name = "CEMA"

    def __init__(self, *args, **_):
        # Source uses no Local Scraper — accept the same constructor signature as
        # the other registry sources for orchestrator simplicity.
        pass

    async def discover(self) -> AsyncIterator[VendorRecord]:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            # Page count comes back in X-WP-TotalPages; ask up to 5 to be safe.
            pages_seen = 0
            for page in range(1, 6):
                rows = await _fetch_page(session, page)
                if not rows:
                    break
                pages_seen += 1
                emitted = 0
                for p in rows:
                    title = _clean_title((p.get("title") or {}).get("rendered"))
                    if not title or "profile" not in (p.get("slug") or "").lower():
                        continue
                    content_html = (p.get("content") or {}).get("rendered") or ""
                    text = _strip_tags(content_html)
                    loc_m = LOC_RE.search(text)
                    website = _extract_website(content_html, exclude_hosts=["cemanet.org", "wp.com", "gravatar"])
                    rec = VendorRecord(
                        company_name=title,
                        website_url=website,
                        headquarters_location=(f"{loc_m.group(1).strip()}, {loc_m.group(2)}" if loc_m else None),
                        contact_email=find_email(text),
                        contact_phone=find_phone(text),
                        facility_size_sqft=find_facility_size(text),
                        certifications_held=["CEMA Member"],
                        primary_business_type="Conveyor Equipment Manufacturer",
                        materials_handled=find_materials(text),
                        key_personnel=[],
                        thomasnet_profile_url=None,
                        data_source="CEMA wp-json",
                    )
                    emitted += 1
                    yield rec
                log.info("CEMA wp-json page %d -> %d records", page, emitted)
                if len(rows) < 100:
                    break
