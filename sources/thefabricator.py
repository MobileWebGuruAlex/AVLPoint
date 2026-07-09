"""The Fabricator industry directory scraper.

FMA's official directory for metal fabrication companies.
Uses Local Scraper to render JS-heavy directory pages.
"""
from __future__ import annotations

import logging
import re
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

from db_async import VendorRecord
from sources.parsers import find_email, find_phone

log = logging.getLogger("thefabricator")

BASE = "https://www.thefabricator.com"

# Directory category pages
CATEGORIES = [
    "/directory/metal-fabrication",
    "/directory/laser-cutting",
    "/directory/welding",
    "/directory/press-brake",
    "/directory/tube-pipe",
    "/directory/stamping",
    "/directory/finishing",
    "/directory/automation",
    "/directory/tooling",
    "/directory/software",
]

LOC_RE = re.compile(r"\b([A-Z][A-Za-z .'\-]{2,28}),\s*([A-Z]{2})\b")


def _parse_directory_md(md: str, category: str) -> list[VendorRecord]:
    """Parse Local Scraper markdown from a Fabricator directory page."""
    out: dict[str, VendorRecord] = {}
    lines = [l.rstrip() for l in md.splitlines() if l.strip()]
    n = len(lines)
    for i, line in enumerate(lines):
        # Company entries typically appear as headings or bold text with links
        name = None
        website = None
        link_m = re.search(r"\[([^\]]{4,100})\]\((https?://[^)]+)\)", line)
        if link_m:
            name = link_m.group(1).strip()
            url = link_m.group(2).strip()
            host = (urlparse(url).hostname or "").lower()
            if host and "thefabricator" not in host:
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
                                         "page", "next", "previous", "home", "login",
                                         "the fabricator", "fma", "copyright")):
            continue
        if len(name) < 4 or len(name) > 150:
            continue

        window = " \n ".join(lines[i+1:i+6]) if i+1 < n else ""
        loc_m = LOC_RE.search(window)
        location = f"{loc_m.group(1).strip()}, {loc_m.group(2)}" if loc_m else None

        cat_clean = category.replace("/directory/", "").replace("-", " ").title()
        out[name] = VendorRecord(
            company_name=name,
            website_url=website,
            headquarters_location=location,
            contact_email=find_email(window),
            contact_phone=find_phone(window),
            primary_business_type="Metal Fabricator",
            capabilities=[cat_clean] if cat_clean else [],
            data_source=f"TheFabricator:{category}",
        )
    return list(out.values())


class TheFabricatorSource:
    name = "TheFabricator"

    def __init__(self, html_scrape, *args, **_):
        self.html_scrape = html_scrape

    async def discover(self) -> AsyncIterator[VendorRecord]:
        for cat in CATEGORIES:
            url = f"{BASE}{cat}"
            log.info("[TheFabricator] scraping %s", url)
            md = await self.html_scrape(url, wait_ms=5000, scroll=True)
            if not md:
                log.warning("[TheFabricator] empty for %s", url)
                continue
            records = _parse_directory_md(md, cat)
            for r in records:
                yield r
            log.info("[TheFabricator] %s -> %d records", cat, len(records))
