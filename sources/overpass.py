"""OpenStreetMap Overpass API source.

Provides massive global discovery of industrial facilities and craft nodes.
Extracts name, address, website, phone, and coordinates. Zero cost.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

import aiohttp

from db_async import AsyncDB, VendorRecord

log = logging.getLogger("overpass")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# We query specific countries sequentially to avoid hitting memory limits.
COUNTRIES = [
    "United States", "Germany", "France", "United Kingdom", "Italy", "Spain", "Poland", 
    "Canada", "Australia", "Netherlands", "Sweden", "Switzerland"
]

QUERIES = [
    """
    [out:json][timeout:90];
    area["name:en"="{country}"]->.searchArea;
    (
      nwr["craft"="metal_construction"](area.searchArea);
      nwr["industrial"="fabrication"](area.searchArea);
      nwr["man_made"="works"](area.searchArea);
      nwr["craft"="welder"](area.searchArea);
      nwr["industrial"="welding"](area.searchArea);
      nwr["industrial"="metals"](area.searchArea);
      nwr["man_made"="storage_tank"](area.searchArea);
    );
    out center;
    """,
    """
    [out:json][timeout:90];
    area["name"="{country}"]->.searchArea;
    (
      nwr["craft"="metal_construction"](area.searchArea);
      nwr["industrial"="fabrication"](area.searchArea);
      nwr["man_made"="works"](area.searchArea);
      nwr["craft"="welder"](area.searchArea);
      nwr["industrial"="welding"](area.searchArea);
      nwr["industrial"="metals"](area.searchArea);
      nwr["man_made"="storage_tank"](area.searchArea);
    );
    out center;
    """
]

class OverpassSource:
    name = "OverpassAPI"

    def __init__(self):
        pass

    async def discover(self) -> AsyncIterator[VendorRecord]:
        async with aiohttp.ClientSession() as session:
            for country in COUNTRIES:
                log.info("OverpassAPI querying for %s", country)
                data = None
                
                # Try english name first, then native name
                for query_template in QUERIES:
                    query = query_template.replace("{country}", country)
                    try:
                        async with session.post(OVERPASS_URL, data={"data": query}, timeout=100) as r:
                            if r.status == 200:
                                data = await r.json()
                                break
                            elif r.status == 429:
                                log.warning("OverpassAPI rate limited for %s", country)
                                await asyncio.sleep(60)
                    except Exception as e:
                        log.debug("OverpassAPI failed for %s: %s", country, e)
                        
                    await asyncio.sleep(5)
                
                if not data:
                    continue
                    
                elements = data.get("elements", [])
                log.info("OverpassAPI found %d elements in %s", len(elements), country)
                
                for el in elements:
                    tags = el.get("tags", {})
                    name = tags.get("name") or tags.get("name:en")
                    if not name or len(name) < 3:
                        continue
                        
                    website = tags.get("website") or tags.get("contact:website")
                    phone = tags.get("phone") or tags.get("contact:phone")
                    email = tags.get("email") or tags.get("contact:email")
                    
                    city = tags.get("addr:city")
                    street = tags.get("addr:street")
                    postcode = tags.get("addr:postcode")
                    
                    loc_parts = [p for p in (city, country) if p]
                    location = ", ".join(loc_parts) if loc_parts else country
                    
                    yield VendorRecord(
                        company_name=name,
                        website_url=website,
                        contact_phone=phone,
                        contact_email=email,
                        headquarters_location=location,
                        street_address=street,
                        city=city,
                        zip_postal_code=postcode,
                        country=country,
                        certifications_held=[],
                        materials_handled=[],
                        key_personnel=[],
                        data_source=f"OverpassAPI:{country}"
                    )
                    
                await asyncio.sleep(15) # Polite delay between countries
