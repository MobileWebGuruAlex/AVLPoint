"""OpenCorporates cross-referencer (zero Local Scraper cost).

OpenCorporates indexes 200M+ companies from official registries worldwide.
The free tier accepts unauthenticated GETs at ~250 requests/day with
deliberate throttling. We use it to:

  1) Resolve existing vendor records by NAME -> jurisdiction, address,
     incorporation date, registry URL (fills incomplete records).
  2) Discover NEW vendor candidates by industry-code (NAICS/SIC) search.

Output: VendorRecord stream with data_source = "OpenCorporates".

Run cadence: this source is enrichment-shaped — it walks the incomplete
records in the DB looking for matches. It also seeds a small handful of
candidates per cycle via industry-code search.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncIterator, Optional

import aiohttp

from db_async import AsyncDB, VendorRecord

log = logging.getLogger("opencorporates")

BASE = "https://api.opencorporates.com/v0.4"
HEADERS = {
    "User-Agent": "AVLpoint-Directory/1.0 (industrial vendor directory; https://avlpoint.com)",
    "Accept": "application/json",
}

# Industry codes that cover the bulk of pressure-equipment / steel-fabrication
# / heat-exchanger / conveyor-equipment vendors we care about.
SIC_CODES = [
    "3443",  # Fabricated Plate Work (Boiler Shops)
    "3441",  # Fabricated Structural Metal
    "3535",  # Conveyors & Conveying Equipment
    "3559",  # Special Industry Machinery
]

# Conservative concurrency: open data, but be polite.
SEM = asyncio.Semaphore(3)


def _to_vendor_from_search(c: dict, src_tag: str) -> Optional[VendorRecord]:
    company = c.get("company") if isinstance(c.get("company"), dict) else c
    if not isinstance(company, dict):
        return None
    name = (company.get("name") or "").strip()
    if not name:
        return None
    juris = company.get("jurisdiction_code") or ""
    addr = company.get("registered_address_in_full") or company.get("registered_address") or ""
    addr_str = addr if isinstance(addr, str) else (addr.get("street_address") if isinstance(addr, dict) else "")
    incorp = (company.get("incorporation_date") or "")[:4] or None
    web = company.get("homepage_url") or None
    return VendorRecord(
        company_name=name,
        website_url=web,
        headquarters_location=(addr_str.strip() or juris) or None,
        contact_email=None,
        contact_phone=None,
        year_established=incorp,
        certifications_held=[],
        primary_business_type=None,
        materials_handled=[],
        key_personnel=[],
        thomasnet_profile_url=None,
        data_source=f"OpenCorporates:{src_tag}",
    )


async def _get_json(session: aiohttp.ClientSession, url: str, api_token: str, query: str = "", **kw) -> Optional[dict]:
    params = kw.pop("params", {})
    if api_token:
        params["api_token"] = api_token
    kw["params"] = params
    
    async with SEM:
        for attempt in range(2):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=20), **kw) as resp:
                    if resp.status == 200:
                        return await resp.json(content_type=None)
                    if resp.status == 404: 
                        return None
                    if resp.status == 403 or resp.status == 429: # rate limited
                        print(f"DEBUG: OpenCorporates rate limit ({resp.status}), failing fast", flush=True)
                        await asyncio.sleep(2)
                        return None
                    
                    print(f"DEBUG: OpenCorporates error {resp.status}", flush=True)
            except Exception as e:
                print(f"DEBUG: OpenCorporates exception: {e}", flush=True)
                
            await asyncio.sleep(1 + attempt)
        return None


async def _search_name(session, name: str, api_token: str) -> list[dict]:
    name = name.strip()
    if not name or len(name) < 4:
        return []
    params = {"q": name, "per_page": "5"}
    data = await _get_json(session, f"{BASE}/companies/search", api_token, params=params)
    if not data:
        return []
    results = data.get("results", {}).get("companies", [])
    return results or []


async def _search_industry(session, sic: str, api_token: str, per_page: int = 30, jurisdiction: str = "") -> list[dict]:
    """Discover NEW companies by industry code."""
    params = {"q": "*", "industry_codes": sic, "per_page": str(per_page)}
    if jurisdiction:
        params["jurisdiction_code"] = jurisdiction
    data = await _get_json(session, f"{BASE}/companies/search", api_token, params=params)
    if not data:
        return []
    return data.get("results", {}).get("companies", []) or []


class OpenCorporatesSource:
    name = "OpenCorporates"

    def __init__(self, db: AsyncDB, max_lookups: int = 50,
                 enable_industry_discovery: bool = True):
        self.db = db
        self.max_lookups = max_lookups
        self.enable_industry_discovery = enable_industry_discovery
        import os
        self.api_token = os.environ.get("OPENCORPORATES_API_KEY")
        if not self.api_token:
            log.warning("OpenCorporates disabled: OPENCORPORATES_API_KEY missing from environment.")

    async def discover(self) -> AsyncIterator[VendorRecord]:
        if not self.api_token:
            return
            
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            # 1) Industry-code seeding (new candidates)
            if self.enable_industry_discovery:
                # Add top EU/Global jurisdictions for discovery
                jurisdictions = ["", "gb", "de", "fr", "au", "ca"]
                for sic in SIC_CODES:
                    for jur in jurisdictions:
                        results = await _search_industry(session, sic, self.api_token, per_page=30, jurisdiction=jur)
                        for c in results:
                            v = _to_vendor_from_search(c, f"sic{sic}:{jur or 'global'}")
                            if v:
                                yield v
                        log.info("OpenCorporates SIC %s Jur %s -> %d candidates", sic, jur or 'global', len(results))
                        await asyncio.sleep(2)

            # 2) Name-based cross-reference for incomplete records that lack
            #    location or website. One lookup per vendor, capped.
            targets = await self.db.get_enrich_targets(limit=self.max_lookups * 3)
            performed = 0
            for t in targets:
                if performed >= self.max_lookups:
                    break
                # Only burn a lookup if the record is genuinely missing fields
                # that OpenCorporates is likely to supply.
                if t.get("headquarters_location") and t.get("year_established"):
                    continue
                name = t.get("company_name", "")
                matches = await _search_name(session, name)
                performed += 1
                if not matches:
                    continue
                # Take the best match: same first 4 chars
                best = None
                low = name.lower()[:8]
                for m in matches:
                    cn = (m.get("company", {}).get("name") or "").lower()
                    if cn[:8] == low or low in cn:
                        best = m
                        break
                best = best or matches[0]
                v = _to_vendor_from_search(best, "name-xref")
                if v:
                    # Re-key to the existing record's exact name so the UPSERT
                    # merges by company_name correctly.
                    v.company_name = name
                    yield v
            log.info("OpenCorporates name-xref: performed %d lookups", performed)
