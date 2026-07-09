"""MacRAE's Blue Book industrial directory scraper.

Scrapes category pages for welding, fabrication, machining, and related
industrial categories. Uses Local Scraper for JS-rendered pages.
"""
from __future__ import annotations

import logging
import re
from typing import AsyncIterator, Callable, Optional
from urllib.parse import urlparse

from db_async import VendorRecord
from sources.parsers import find_email, find_phone

log = logging.getLogger("macraes")

# Category search URLs — each returns a paginated list of companies
CATEGORIES = [
    ("welding-equipment-supplies", "Welding Equipment/Supplies"),
    ("welding-services", "Welding Services"),
    ("metal-fabricators", "Metal Fabricator"),
    ("steel-fabricators", "Steel Fabricator"),
    ("sheet-metal-work", "Sheet Metal Fabricator"),
    ("pressure-vessels", "Pressure Vessel Manufacturer"),
    ("heat-exchangers", "Heat Exchanger Manufacturer"),
    ("tanks-metal", "Tank Fabricator"),
    ("boilers", "Boiler Manufacturer"),
    ("machining", "Machine Shop"),
    ("cnc-machining", "CNC Machine Shop"),
    ("pipe-fabrication", "Pipe Fabricator"),
    ("industrial-piping", "Industrial Piping"),
    ("structural-steel", "Structural Steel Fabricator"),
    ("metal-stamping", "Metal Stamping"),
    ("laser-cutting-services", "Laser Cutting Services"),
    ("plasma-cutting", "Plasma Cutting Services"),
    ("industrial-coatings", "Industrial Coatings"),
]

BASE = "https://www.macraesbluebook.com/search"
LOC_RE = re.compile(
    r"\b([A-Z][A-Za-z .'\-]{2,28}),\s*([A-Z]{2})\b"
)
URL_RE = re.compile(r"https?://[^\s)\]\"\'>]+")
COMPANY_LINE_RE = re.compile(r"^#{1,4}\s+(.+)|^\*\*(.+?)\*\*|^\[(.+?)\]\(")


def _parse_macraes_md(md: str, category: str, btype: str) -> list[VendorRecord]:
    """Parse Local Scraper markdown from a MacRAE's category listing page."""
    out: dict[str, VendorRecord] = {}
    lines = [l.rstrip() for l in md.splitlines() if l.strip()]
    n = len(lines)
    i = 0
    while i < n:
        line = lines[i].strip()
        # Try to find company name from heading, bold, or link
        name = None
        website = None
        m = COMPANY_LINE_RE.match(line)
        if m:
            name = (m.group(1) or m.group(2) or m.group(3) or "").strip()
            # Extract link if present
            link_m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", line)
            if link_m:
                name = link_m.group(1).strip()
                url = link_m.group(2).strip()
                if url.startswith("http") and "macraesbluebook" not in url:
                    website = url

        if name and len(name) >= 4 and len(name) <= 150 and name not in out:
            # Check next few lines for location/contact
            window = " \n ".join(lines[i+1:i+6]) if i+1 < n else ""
            loc_m = LOC_RE.search(window)
            location = f"{loc_m.group(1).strip()}, {loc_m.group(2)}" if loc_m else None
            email = find_email(window)
            phone = find_phone(window)

            # Find external website in window if not already found
            if not website:
                for u in URL_RE.findall(window):
                    host = (urlparse(u).hostname or "").lower()
                    if host and "macraesbluebook" not in host and "." in host:
                        website = u
                        break

            # Filter out noise
            low = name.lower()
            if any(skip in low for skip in ("search", "filter", "results", "page",
                                             "next", "previous", "sort", "category",
                                             "home", "login", "sign")):
                i += 1
                continue

            out[name] = VendorRecord(
                company_name=name,
                website_url=website,
                headquarters_location=location,
                contact_email=email,
                contact_phone=phone,
                primary_business_type=btype,
                data_source=f"MacRAEs:{category}",
            )
        i += 1
    return list(out.values())


class MacRAEsSource:
    name = "MacRAEs"

    def __init__(self, html_scrape, *args, **_):
        self.html_scrape = html_scrape

    async def discover(self) -> AsyncIterator[VendorRecord]:
        for slug, btype in CATEGORIES:
            url = f"{BASE}/{slug}"
            log.info("[MacRAEs] scraping %s", url)
            md = await self.html_scrape(url, wait_ms=5000, scroll=True)
            if not md:
                log.warning("[MacRAEs] empty markdown for %s", url)
                continue
            records = _parse_macraes_md(md, slug, btype)
            for r in records:
                yield r
            log.info("[MacRAEs] %s -> %d records", slug, len(records))
