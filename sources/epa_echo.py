"""EPA ECHO facility search — free REST API, zero cost, no auth.

Two-step flow:
1. get_facilities -> returns QueryID and metadata (row count)
2. get_download  -> returns CSV rows for that QueryID

Queries by SIC codes covering fabrication / manufacturing / welding.
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
import re
from typing import AsyncIterator, Optional

import aiohttp

from db_async import VendorRecord

log = logging.getLogger("epa-echo")

BASE = "https://echodata.epa.gov/echo/echo_rest_services"

# SIC codes covering industrial fabrication / pressure equipment / welding
SIC_CODES = [
    "3443",  # Fabricated Plate Work (Boiler Shops)
    "3441",  # Fabricated Structural Metal Mfg
    "3444",  # Sheet Metal Work
    "3446",  # Architectural & Ornamental Metal Work
    "3498",  # Fabricated Pipe and Pipe Fittings
    "3317",  # Steel Pipe and Tubes
    "3312",  # Steel Works, Blast Furnaces
    "3462",  # Iron and Steel Forgings
    "3491",  # Industrial Valves
    "3499",  # Metal Services NEC
    "3535",  # Conveyors & Conveying Equipment
    "3559",  # Special Industry Machinery
    "3599",  # Industrial Machinery NEC
]

SIC_BUSINESS_TYPE = {
    "3443": "Pressure Vessel / Boiler Manufacturer",
    "3441": "Structural Metal Fabricator",
    "3444": "Sheet Metal Fabricator",
    "3446": "Ornamental Metal Fabricator",
    "3498": "Pipe Fabricator",
    "3317": "Steel Pipe / Tube Manufacturer",
    "3312": "Steel Works",
    "3462": "Iron & Steel Forging",
    "3491": "Industrial Valve Manufacturer",
    "3499": "Metal Products Manufacturer",
    "3535": "Conveyor Equipment Manufacturer",
    "3559": "Industrial Machinery Manufacturer",
    "3599": "Industrial Machinery Manufacturer",
}

HEADERS = {"Accept": "application/json"}
SKIP_WORDS = {"school", "university", "hospital", "church", "county of",
              "city of", "town of", "state of", "department of", "water district",
              "sewer", "municipal", "government"}


def _parse_csv_facility(row: dict, sic: str) -> Optional[VendorRecord]:
    """Convert a CSV row from ECHO download into a VendorRecord."""
    name = (row.get("FacName") or row.get("CWPName") or "").strip()
    if not name or len(name) < 3:
        return None
    low = name.lower()
    if any(skip in low for skip in SKIP_WORDS):
        return None

    street = (row.get("FacStreet") or "").strip()
    city = (row.get("FacCity") or "").strip()
    state = (row.get("FacState") or "").strip()
    zipcode = (row.get("FacZip") or "").strip()[:5]
    epa_id = (row.get("RegistryID") or "").strip()

    location_parts = [p for p in (city, state) if p]
    location = ", ".join(location_parts) if location_parts else None

    return VendorRecord(
        company_name=name,
        headquarters_location=location,
        street_address=street if street else None,
        city=city if city else None,
        state_province=state if state else None,
        zip_postal_code=zipcode if zipcode else None,
        country="USA",
        primary_business_type=SIC_BUSINESS_TYPE.get(sic, "Manufacturer"),
        registration_numbers=[f"EPA:{epa_id}"] if epa_id else [],
        data_source=f"EPA-ECHO:SIC{sic}",
    )


class EPAEchoSource:
    name = "EPA-ECHO"

    def __init__(self, *args, **_):
        pass

    async def _query_sic(self, session: aiohttp.ClientSession, sic: str) -> list[VendorRecord]:
        """Query ECHO for facilities matching a SIC code using CSV download."""
        out: list[VendorRecord] = []

        # Step 1: get facility count and QueryID
        params = {
            "output": "JSON",
            "p_sic2": sic,
            "p_act": "Y",
            "responseset": "1000",
        }
        try:
            async with session.get(f"{BASE}.get_facilities", params=params,
                                   timeout=aiohttp.ClientTimeout(total=60)) as r:
                if r.status >= 400:
                    log.warning("EPA get_facilities SIC %s returned %d", sic, r.status)
                    return out
                data = await r.json(content_type=None)
        except Exception as e:
            log.warning("EPA get_facilities SIC %s failed: %s", sic, e)
            return out

        results = data.get("Results", {})
        try:
            total_rows = int(results.get("QueryRows", 0))
        except (ValueError, TypeError):
            total_rows = 0
        qid = results.get("QueryID")

        if total_rows == 0 or not qid:
            log.info("EPA-ECHO SIC %s -> 0 facilities", sic)
            return out

        log.info("EPA-ECHO SIC %s -> %d facilities, QID=%s, downloading...", sic, total_rows, qid)
        await asyncio.sleep(8)  # respect rate limit

        # Step 2: download data using the QueryID — paginate in chunks of 1000
        page = 1
        max_pages = (total_rows // 1000) + 2
        while page <= max_pages:
            dl_params = {
                "qid": qid,
                "output": "CSV",
                "responseset": "1000",
                "pageno": str(page),
            }
            try:
                async with session.get(f"{BASE}.get_download", params=dl_params,
                                       timeout=aiohttp.ClientTimeout(total=120)) as r:
                    if r.status >= 400:
                        log.warning("EPA download SIC %s page %d returned %d", sic, page, r.status)
                        # Try JSON fallback for this page
                        dl_params["output"] = "JSON"
                        async with session.get(f"{BASE}.get_download", params=dl_params,
                                               timeout=aiohttp.ClientTimeout(total=120)) as r2:
                            if r2.status >= 400:
                                log.warning("EPA JSON download SIC %s page %d also returned %d", sic, page, r2.status)
                                break
                            jdata = await r2.json(content_type=None)
                            facilities = jdata.get("Results", {}).get("Facilities", [])
                            if not facilities:
                                break
                            count_before = len(out)
                            for fac in facilities:
                                if isinstance(fac, dict):
                                    v = _parse_csv_facility(fac, sic)
                                    if v:
                                        out.append(v)
                            if len(out) == count_before:
                                break  # no new records
                    else:
                        text = await r.text()
                        reader = csv.DictReader(io.StringIO(text))
                        count_before = len(out)
                        for row in reader:
                            v = _parse_csv_facility(row, sic)
                            if v:
                                out.append(v)
                        if len(out) == count_before:
                            break  # no new records on this page
            except Exception as e:
                log.warning("EPA download SIC %s page %d failed: %s", sic, page, e)
                break

            page += 1
            if len(out) >= total_rows:
                break
            await asyncio.sleep(5)  # rate limit between pages

        return out

    async def discover(self) -> AsyncIterator[VendorRecord]:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            for sic in SIC_CODES:
                log.info("EPA-ECHO querying SIC %s", sic)
                try:
                    records = await self._query_sic(session, sic)
                    for r in records:
                        yield r
                    log.info("EPA-ECHO SIC %s -> %d records yielded", sic, len(records))
                except Exception:
                    log.exception("EPA-ECHO SIC %s crashed", sic)
                await asyncio.sleep(15)  # 300 req/hr limit ≈ 12s between requests
