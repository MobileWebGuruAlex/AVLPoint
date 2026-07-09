"""DuckDuckGo Semantic Discovery source.

Discovers companies via specific localized keyword searches.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator
from urllib.parse import urlparse

from duckduckgo_search import DDGS

from db_async import AsyncDB, VendorRecord

log = logging.getLogger("ddg-discovery")

KEYWORDS = [
    "ASME pressure vessel manufacturing", "API-regulated oil and gas equipment",
    "structural steel heavy modular assembly", "subsea offshore infrastructure fabrication",
    "reactive exotic alloy fabrication", "titanium tantalum fabrication",
    "FRP dualaminate pressure containment", "nuclear EPC supply chain manufacturing",
    "ASME U stamp fabrication", "ASME U2 stamp vessel builder", "National Board R stamp repair",
    "AWS-CWI structural fabrication", "ASNT NDT Level II/III fabrication shop",
    "NACE certified coating industrial", "ISO 9001:2015 high-spec fabrication",
    "PED 2014/68/EU pressure equipment", "NQA-1 nuclear manufacturing",
    "orbital welding services", "explosion bonded clad metals", "heavy wall reactor machining",
    "filament winding FRP tanks", "cryogenic storage tank manufacturing"
]

COUNTRIES = [
    "United States", "Germany", "France", "United Kingdom", "Italy", "Spain", 
    "Canada", "Australia", "Netherlands", "Sweden", "Switzerland", "Japan",
    "South Korea", "Taiwan", "India", "Vietnam", "Thailand", "Malaysia",
    "Indonesia", "Philippines", "Singapore", "New Zealand", "South Africa",
    "Turkey", "Israel", "Mexico", "Brazil", "Argentina", "Chile", "Colombia",
    "Poland", "Belgium", "Austria", "Denmark", "Norway", "Finland", "Ireland",
    "Czech Republic", "Hungary", "Portugal", "Greece", "United Arab Emirates",
    "Saudi Arabia", "Qatar", "Kuwait", "Oman", "Bahrain", "Egypt", "Morocco",
    "Nigeria", "Kenya", "Ghana", "Peru", "Ecuador", "Uruguay", "Costa Rica"
]

class DuckDuckGoDiscoverySource:
    name = "DDG-Discovery"

    def __init__(self, db: AsyncDB):
        self.db = db

    async def discover(self) -> AsyncIterator[VendorRecord]:
        try:
            ddgs = DDGS()
        except ImportError:
            log.error("duckduckgo_search not installed, skipping DDG-Discovery")
            return
            
        try:
            from sources.nimbleway_search import STATES
        except ImportError:
            STATES = ["United States"]
            
        def location_generator():
            us_list = list(STATES)
            intl_list = [c for c in COUNTRIES if c != "United States"]
            us_idx, intl_idx = 0, 0
            
            while us_idx < len(us_list) or intl_idx < len(intl_list):
                for _ in range(7):
                    if us_idx < len(us_list):
                        yield f"{us_list[us_idx]}, United States"
                        us_idx += 1
                for _ in range(3):
                    if intl_idx < len(intl_list):
                        yield intl_list[intl_idx]
                        intl_idx += 1
                        
        for country in location_generator():
            for keyword in KEYWORDS:
                query = f"{keyword} {country}"
                log.info("DDG-Discovery searching: %s", query)
                
                try:
                    results = await asyncio.to_thread(ddgs.text, query, max_results=15)
                    for r in results:
                        url = r.get("href")
                        if not url:
                            continue
                            
                        # Filter out common directories
                        domain = urlparse(url).netloc.lower()
                        if any(skip in domain for skip in ["thomasnet.com", "iqsdirectory.com", "yellowpages", "yelp", "linkedin.com", "facebook.com", "wikipedia.org"]):
                            continue
                            
                        if self.db.is_seen(url):
                            continue
                        await self.db.mark_seen(url, "ddg-discovery")
                            
                        name = r.get("title", "").split("-")[0].split("|")[0].strip()
                        if await self.db.is_seen_company(name):
                            continue
                        body = r.get("body", "")
                        
                        yield VendorRecord(
                            company_name=name,
                            website_url=url,
                            company_description=body,
                            country=country,
                            certifications_held=[],
                            materials_handled=[],
                            key_personnel=[],
                            data_source="DDG-Discovery"
                        )
                except Exception as e:
                    log.debug("DDG-Discovery failed for %s: %s", query, e)
                    
                await asyncio.sleep(2) # rate limit prevention
