"""Nimbleway search-based industrial company discovery.

Uses Nimbleway's google_search agent to find companies by querying
"{industry} company {state}" across all 50 states and multiple
industry keywords. Reverses the industry query list to meet Local Scraper in the middle.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

from db_async import AsyncDB, VendorRecord
from db_async import AsyncDB, VendorRecord

INDUSTRY_QUERIES = [
    "sheet metal fabrication", "CNC machining", "structural steel fabrication",
    "precision machining", "welding services", "custom metal fabrication",
    "stamping and pressing", "metal casting", "tool and die making",
    "metal finishing", "powder coating", "laser cutting services",
    "waterjet cutting", "metal spinning", "roll forming",
    "tube fabrication", "wire forming", "prototyping services",
    "heavy equipment manufacturing", "industrial machinery",
    "aerospace parts manufacturing", "automotive parts manufacturing",
    "medical device manufacturing", "electronics manufacturing",
    "plastic injection molding", "blow molding", "extrusion services",
    "thermoforming", "composites manufacturing", "fiberglass fabrication",
    "glass manufacturing", "ceramics manufacturing", "textile manufacturing",
    "apparel manufacturing", "food processing equipment", "beverage equipment",
    "packaging machinery", "material handling equipment", "conveyor systems",
    "robotics integration", "automation systems", "control panel building",
    "electrical equipment manufacturing", "lighting manufacturing",
    "HVAC equipment", "refrigeration equipment", "plumbing fixtures",
    "pumps and valves", "hydraulics and pneumatics", "compressors",
    "fasteners and hardware", "bearings and gears", "springs and wire forms",
    "seals and gaskets", "adhesives and sealants", "paints and coatings",
    "chemicals manufacturing", "plastics resins", "rubber products",
    "woodworking machinery", "furniture manufacturing", "building materials",
    "construction equipment", "agricultural equipment", "mining equipment",
    "oil and gas equipment", "renewable energy equipment", "solar panel manufacturing",
    "wind turbine components", "battery manufacturing", "fuel cell manufacturing",
    "medical supplies", "pharmaceutical manufacturing", "biotechnology equipment",
    "laboratory instruments", "optical instruments", "measuring and testing equipment",
    "semiconductor manufacturing", "printed circuit boards", "electronic components",
    "telecommunications equipment", "computer hardware", "peripherals manufacturing",
    "consumer electronics", "appliances manufacturing", "toys and games",
    "sporting goods", "musical instruments", "jewelry manufacturing",
    "marine equipment", "shipbuilding", "railway equipment",
    "aerospace engineering", "defense contracting", "security systems",
    "fire protection equipment", "safety equipment", "environmental equipment",
    "water treatment systems", "waste management equipment", "recycling machinery"
]

STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
    "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
]

INTERNATIONAL_REGIONS = [
    "United Kingdom", "Germany", "France", "Italy", "Spain", "Poland",
    "Netherlands", "Belgium", "Sweden", "Switzerland", "Austria",
    "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Colombia",
    "Japan", "South Korea", "Taiwan", "India", "Vietnam", "Thailand",
    "Malaysia", "Indonesia", "Philippines", "Singapore",
    "Australia", "New Zealand", "South Africa", "Turkey", "Israel"
]

def _extract_from_search_result(item: dict, query_base: str) -> Optional[VendorRecord]:
    """Parse a basic google search result snippet into a VendorRecord."""
    url = item.get("url") or ""
    if not url or "yellowpages" in url or "yelp" in url or "linkedin" in url or "facebook" in url or "zoominfo" in url or "manta" in url or "thomasnet" in url or "bbb.org" in url or "indeed.com" in url or "glassdoor" in url or "mapquest" in url:
        return None
        
    title = item.get("title") or ""
    title = title.split("|")[0].split("-")[0].strip()
    if not title or len(title) < 3:
        return None
        
    v = VendorRecord(
        company_name=title,
        website_url=url,
        company_description=item.get("description"),
        primary_business_type="Manufacturer/Fabricator",
    )
    return v

log = logging.getLogger("nimbleway-search")

class NimblewaySearchSource:
    name = "NimblewaySearch"

    def __init__(self, nimbleway_api_key: str, db: AsyncDB, max_queries: int = 2000):
        self.nimbleway_api_key = nimbleway_api_key
        self.db = db
        self.max_queries = max_queries
        self._queries_run = 0

    async def _search(self, query: str) -> list[dict]:
        """Run a single Nimbleway search query via HTTP."""
        try:
            import aiohttp
            
            headers = {
                "Authorization": f"Bearer {self.nimbleway_api_key}",
                "Content-Type": "application/json"
            }
            
            # Using Nimble API standard Web Search endpoint
            payload = {
                "url": f"https://www.google.com/search?q={query}",
                "render": True
            }
            
            async with aiohttp.ClientSession() as session:
                # Since we don't have the exact Nimbleway Python SDK, we fallback to a simple Google Search via Nimble Browser
                async with session.post("https://api.weblens.nimbleway.com/api/v1/search", json=payload, headers=headers, timeout=30) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("organic_results", [])
                    else:
                        log.debug("Nimbleway search HTTP %s", resp.status)
                        return []
        except Exception as e:
            log.debug("Nimbleway search failed for %r: %s", query, e)
            return []

    async def discover(self) -> AsyncIterator[VendorRecord]:
        seen_names = set()
        queries_done = 0
        
        # Load cached queries (Nimbleway's own cache for the new query format)
        cache_file = "nimbleway_completed_queries.txt"
        completed_queries = set()
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                completed_queries = set(f.read().splitlines())
        log.info("[%s] Loaded %d completed queries from cache", self.name, len(completed_queries))

        # Reverse the queries so it mixes up the order
        reversed_queries = list(reversed(INDUSTRY_QUERIES))

        # Phase 1: 70/30 U.S. vs International weighting generator
        log.info("[%s] Starting global discovery phase with 70%% U.S. priority...", self.name)
        
        def location_generator():
            us_list = list(reversed(STATES))
            intl_list = list(INTERNATIONAL_REGIONS)
            us_idx, intl_idx = 0, 0
            
            while us_idx < len(us_list) or intl_idx < len(intl_list):
                # Yield 7 U.S. regions
                for _ in range(7):
                    if us_idx < len(us_list):
                        yield us_list[us_idx]
                        us_idx += 1
                
                # Yield 3 Intl regions
                for _ in range(3):
                    if intl_idx < len(intl_list):
                        yield intl_list[intl_idx]
                        intl_idx += 1
                        
        for query_base in reversed_queries:
            if queries_done >= self.max_queries:
                break
            for location in location_generator():
                if queries_done >= self.max_queries:
                    break
                
                # Use a slightly different query to find companies Local Scraper missed
                query = f"top {query_base} in {location}"
                
                if query in completed_queries:
                    continue
                    
                results = await self._search(query)
                self._queries_run += 1
                
                # Mark query as completed immediately
                completed_queries.add(query)
                with open(cache_file, "a", encoding="utf-8") as f:
                    f.write(query + "\n")
                    
                for r in results:
                    v = _extract_from_search_result(r, query_base)
                    if v and v.company_name.lower() not in seen_names:
                        if await self.db.is_seen_company(v.company_name):
                            continue
                        seen_names.add(v.company_name.lower())
                        v.data_source = f"{self.name}:{query_base[:30]}"
                        yield v
                queries_done += 1
                if queries_done % 10 == 0:
                    log.info("[%s] %d queries, %d U.S. companies found", self.name, queries_done, len(seen_names))
                await asyncio.sleep(0.5)

        log.info("[%s] Discovery phase complete.", self.name)
