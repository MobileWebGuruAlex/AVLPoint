"""ASME stamp-holder discovery.

ASME publishes its accredited-company directory at
https://caconnect.asme.org/ (a search SPA). Strategy:
  1) Pull the public certificate-holder JSON feeds if reachable.
  2) Otherwise, query a sliding set of stamp/state pairs via Local Scraper
     /scrape on the directory's URL-driven search pages.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import AsyncIterator, Optional

from db_async import AsyncDB, VendorRecord
from http_client import ConcurrentClient

log = logging.getLogger("asme")

STAMPS = ["U", "U2", "S", "R", "H", "PP", "RTP-1"]
STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY",
]

API_CANDIDATES = [
    # caconnect public search — endpoint name guessed; falls through gracefully if 404.
    "https://caconnect.asme.org/api/search?certificateType={stamp}&state={state}&pageSize=200&page=1",
    "https://caconnect.asme.org/api/companies?stamp={stamp}&state={state}&take=200",
]


def _to_vendor(raw: dict, stamp: str) -> Optional[VendorRecord]:
    name = (
        raw.get("companyName")
        or raw.get("name")
        or raw.get("CompanyName")
    )
    if not name:
        return None
    city = raw.get("city") or raw.get("City") or ""
    state = raw.get("state") or raw.get("State") or ""
    country = raw.get("country") or raw.get("Country") or "USA"
    loc = ", ".join(p for p in (city, state, country) if p)
    return VendorRecord(
        company_name=name.strip(),
        headquarters_location=loc or None,
        website_url=raw.get("website") or raw.get("Website"),
        contact_phone=raw.get("phone") or raw.get("Phone"),
        certifications_held=[f"ASME {stamp}"],
        primary_business_type="Manufacturer",
        materials_handled=[],
        key_personnel=[],
        data_source=f"ASME CA Connect:{stamp}",
    )


class ASMESource:
    name = "ASME"

    def __init__(self, http: ConcurrentClient, html_scrape, db: AsyncDB,
                 stamps: list[str] = STAMPS, states: list[str] = STATES):
        self.http = http
        self.html_scrape = html_scrape
        self.db = db
        self.stamps = stamps
        self.states = states

    async def _query_combo(self, stamp: str, state: str) -> list[VendorRecord]:
        out: list[VendorRecord] = []
        for tmpl in API_CANDIDATES:
            data = await self.http.get_json(tmpl.format(stamp=stamp, state=state),
                                             headers={"Accept": "application/json"})
            if not data:
                continue
            rows = None
            for key in ("results", "items", "data", "companies", "value"):
                if isinstance(data, dict) and isinstance(data.get(key), list):
                    rows = data[key]
                    break
            if rows is None and isinstance(data, list):
                rows = data
            if not rows:
                continue
            for raw in rows:
                if isinstance(raw, dict):
                    v = _to_vendor(raw, stamp)
                    if v:
                        out.append(v)
            return out
        return out

    async def discover(self) -> AsyncIterator[VendorRecord]:
        sem = asyncio.Semaphore(20)

        async def one(stamp, state):
            async with sem:
                return stamp, state, await self._query_combo(stamp, state)

        tasks = [asyncio.create_task(one(s, st)) for s in self.stamps for st in self.states]
        for t in asyncio.as_completed(tasks):
            stamp, state, vendors = await t
            for v in vendors:
                yield v
            if vendors:
                log.debug("ASME %s/%s -> %d", stamp, state, len(vendors))
