"""Wikidata SPARQL API source.

Provides discovery of large international manufacturing companies.
Extracts name, country, and website.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

import aiohttp

from db_async import AsyncDB, VendorRecord

log = logging.getLogger("wikidata")

SPARQL_URL = "https://query.wikidata.org/sparql"
HEADERS = {
    "User-Agent": "AVLpoint-Directory/1.0 (industrial vendor directory; https://avlpoint.com)",
    "Accept": "application/sparql-results+json"
}

# Find instances of 'manufacturing company' (Q2286950) or 'steelmaker' (Q104523996)
# with a website and country.
QUERY = """
SELECT ?company ?companyLabel ?website ?countryLabel WHERE {
  { ?company wdt:P31 wd:Q2286950. } UNION { ?company wdt:P31 wd:Q104523996. }
  ?company wdt:P856 ?website.
  OPTIONAL { ?company wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
LIMIT 2000
"""

class WikidataSource:
    name = "Wikidata"

    def __init__(self):
        pass

    async def discover(self) -> AsyncIterator[VendorRecord]:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            log.info("Wikidata querying SPARQL endpoint for manufacturing companies...")
            try:
                async with session.get(SPARQL_URL, params={"query": QUERY}, timeout=60) as r:
                    if r.status == 200:
                        data = await r.json()
                        results = data.get("results", {}).get("bindings", [])
                        log.info("Wikidata found %d companies", len(results))
                        
                        for b in results:
                            name = b.get("companyLabel", {}).get("value")
                            if not name or name.startswith("http"):
                                continue
                            
                            website = b.get("website", {}).get("value")
                            country = b.get("countryLabel", {}).get("value")
                            
                            yield VendorRecord(
                                company_name=name,
                                website_url=website,
                                country=country,
                                headquarters_location=country,
                                certifications_held=[],
                                materials_handled=[],
                                key_personnel=[],
                                data_source="Wikidata:SPARQL"
                            )
                    else:
                        log.warning("Wikidata returned %d: %s", r.status, await r.text())
            except Exception as e:
                log.warning("Wikidata SPARQL query failed: %s", e)
