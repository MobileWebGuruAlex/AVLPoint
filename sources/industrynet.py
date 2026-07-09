"""IndustryNet directory scraper.

IndustryNet is a public directory of US manufacturers and industrial
service providers. Uses Local Scraper for JS-rendered pages.
"""
from __future__ import annotations

import logging
import re
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

from db_async import VendorRecord
from sources.parsers import find_email, find_phone, find_location

log = logging.getLogger("industrynet")

BASE = "https://www.industrynet.com/manufacturing"

CATEGORIES = [
    ("/welding-services", "Welding Services"),
    ("/metal-fabrication", "Metal Fabricator"),
    ("/sheet-metal-fabrication", "Sheet Metal Fabricator"),
    ("/steel-fabrication", "Steel Fabricator"),
    ("/pipe-fabrication", "Pipe Fabricator"),
    ("/machine-shops", "Machine Shop"),
    ("/cnc-machining-services", "CNC Machine Shop"),
    ("/heat-treating", "Heat Treating"),
    ("/pressure-vessels", "Pressure Vessel Manufacturer"),
    ("/boiler-manufacturing", "Boiler Manufacturer"),
    ("/tanks-vessels", "Tank Fabricator"),
    ("/structural-steel-fabrication", "Structural Steel Fabricator"),
    ("/industrial-coatings", "Industrial Coatings"),
    ("/laser-cutting", "Laser Cutting Services"),
    ("/plasma-cutting-services", "Plasma Cutting Services"),
    ("/waterjet-cutting", "Waterjet Cutting Services"),
]


def _parse_industrynet_md(md: str, category: str, btype: str) -> list[VendorRecord]:
    """Parse Local Scraper markdown from an IndustryNet category listing."""
    out: dict[str, VendorRecord] = {}
    lines = [l.rstrip() for l in md.splitlines() if l.strip()]
    n = len(lines)
    for i, line in enumerate(lines):
        name = None
        website = None
        # Company entries as links or bold text
        link_m = re.search(r"\[([^\]]{4,100})\]\((https?://[^)]+)\)", line)
        if link_m:
            name = link_m.group(1).strip()
            url = link_m.group(2).strip()
            host = (urlparse(url).hostname or "").lower()
            if host and "industrynet" not in host:
                website = url
        else:
            heading_m = re.match(r"^#{1,4}\s+(.{4,120})$", line)
            bold_m = re.match(r"^\*\*(.{4,120})\*\*", line)
            if heading_m:
                name = heading_m.group(1).strip()
            elif bold_m:
                name = bold_m.group(1).strip()

        if not name or name in out:
            continue
        low = name.lower()
        if any(skip in low for skip in ("search", "filter", "directory", "results",
                                         "home", "login", "industry", "manufacturing",
                                         "copyright", "contact us")):
            continue
        if len(name) < 4 or len(name) > 150:
            continue

        window = " \n ".join(lines[i+1:i+6]) if i+1 < n else ""
        location = find_location(window)
        out[name] = VendorRecord(
            company_name=name,
            website_url=website,
            headquarters_location=location,
            contact_email=find_email(window),
            contact_phone=find_phone(window),
            primary_business_type=btype,
            data_source=f"IndustryNet:{category}",
        )
    return list(out.values())


class IndustryNetSource:
    name = "IndustryNet"

    def __init__(self, html_scrape, *args, **_):
        self.html_scrape = html_scrape

    async def discover(self) -> AsyncIterator[VendorRecord]:
        for path, btype in CATEGORIES:
            url = f"{BASE}{path}"
            log.info("[IndustryNet] scraping %s", url)
            md = await self.html_scrape(url, wait_ms=5000, scroll=True)
            if not md:
                log.warning("[IndustryNet] empty for %s", url)
                continue
            records = _parse_industrynet_md(md, path, btype)
            for r in records:
                yield r
            log.info("[IndustryNet] %s -> %d records", path, len(records))
