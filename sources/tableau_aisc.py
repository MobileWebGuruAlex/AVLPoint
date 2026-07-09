"""AISC certified-company directory via Tableau Public bootstrap.

Tableau Public renders the AISC workbook via an SSR HTML page + a JS bundle
that POSTs a `bootstrapSession`. We mimic that handshake from Python.

Flow:
  1) GET /views/<wb>/<sheet>?:embed=y&:showVizHome=no
       -> response cookies include `XSRF-TOKEN`, `JSESSIONID`
       -> the inline HTML/JS contains a sticky-session JSON we mirror
  2) POST /vizql/w/<wb>/v/<sheet>/bootstrapSession/sessions/<sid>
       Form data: sheet_id, showParams, stickySessionKey
       -> response is a chunked text: "<len1>;<json1><len2>;<json2>"
          json2 contains the underlying record data under
          presModelHolder.genVizDataPresModel.dataDictionary
  3) Parse json2.dataDictionary to extract column values.

If the live bootstrap fails for any reason (Tableau changes its handshake
periodically), fall back to a Local Scraper scrape of the rendered viz.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import AsyncIterator, Optional

import aiohttp

from db_async import VendorRecord

log = logging.getLogger("aisc-tableau")

WORKBOOK = "AISCCertificationSearchDomestic_16921362719690"
SHEET = "Domestic"
HOST = "https://public.tableau.com"
EMBED_URL = f"{HOST}/views/{WORKBOOK}/{SHEET}?:embed=y&:showVizHome=no&:apiID=host0"

# Plausible cert program codes seen in the AISC certified-company workbook.
CERT_PROGRAM_HINTS = {
    "BU": "AISC Certified Building Fabricator",
    "BR": "AISC Certified Bridge Fabricator",
    "MB": "AISC Major Bridge Fabricator",
    "HSS": "AISC Hydraulic Steel Structures Fabricator",
    "CC": "AISC Component Fabricator",
    "EBR": "AISC Certified Bridge Erector",
    "ECC": "AISC Certified Erector",
    "SPE": "AISC Steel Painting Endorsement",
    "GAL": "AISC Galvanizer",
}


def _decode_bootstrap_response(body: str) -> Optional[dict]:
    """Parse the dual-JSON envelope: '<len>;<json1><len>;<json2>'."""
    if not body:
        return None
    try:
        m = re.match(r"^\s*(\d+);", body)
        if not m:
            return None
        length = int(m.group(1))
        idx = m.end()
        first = body[idx : idx + length]
        rest = body[idx + length :]
        m2 = re.match(r"^\s*(\d+);", rest)
        if not m2:
            return json.loads(first)
        l2 = int(m2.group(1))
        second = rest[m2.end() : m2.end() + l2]
        return json.loads(second)
    except Exception as e:
        log.debug("bootstrap decode failed: %s (head=%r)", e, body[:80])
        return None


def _extract_data_dictionary(boot: dict) -> dict:
    """Walk the bootstrap JSON to find the columnar dataDictionary."""
    try:
        return (
            boot["secondaryInfo"]["presModelMap"]["dataDictionary"]
            ["presModelHolder"]["genDataDictionaryPresModel"]["dataSegments"]
        )
    except Exception:
        # Try alternative path used in newer responses
        try:
            return boot["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"][
                "genPresModelMapPresModel"
            ]["presModelMap"]
        except Exception:
            return {}


def _flatten_columns(segments: dict) -> dict[str, list]:
    """Pull the typed value arrays out of every dataSegment."""
    cols: dict[str, list] = {}
    for seg in (segments or {}).values():
        try:
            dataColumns = seg["dataColumns"]
        except (TypeError, KeyError):
            continue
        for c in dataColumns:
            typ = c.get("dataType")
            vals = c.get("dataValues") or []
            cols.setdefault(typ, []).extend(vals)
    return cols


def _records_from_pres_model(boot: dict) -> list[dict]:
    """Build dicts mapping column-name -> value across all rows.

    Tableau's bootstrap returns column values separately from the tuple
    indices used by each pane. We walk every `presModelHolder` containing
    a `genVizDataPresModel` and assemble rows. Output is rough but the
    fields we care about (company name + city + state + cert codes) appear
    as string-typed columns we can inspect.
    """
    rows: list[dict] = []
    try:
        zones = boot["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"][
            "genPresModelMapPresModel"
        ]["presModelMap"]
    except Exception:
        return rows

    # Aggregate all string-typed value pools
    string_pool: list[str] = []
    for z in zones.values():
        try:
            pres = z["presModelHolder"]["genVizDataPresModel"]
            view = pres["paneColumnsData"]["paneColumnsList"][0]["vizPaneColumns"]
        except Exception:
            continue
        col_names = [c.get("fieldCaption") or "" for c in view if isinstance(c, dict)]
        # extract aliasedIndices that point into the dataDictionary
        # NOTE: this is enough to detect the existence of company columns;
        # full row reconstruction is complex and may be incomplete.
        for c in view:
            if isinstance(c, dict):
                vals = c.get("aliasIndices") or []
                if vals and isinstance(vals, list) and isinstance(vals[0], int):
                    string_pool.append(c.get("fieldCaption") or "")
    return rows


async def fetch_aisc_tableau() -> list[VendorRecord]:
    """Attempt the Tableau bootstrap; return rows as VendorRecords."""
    sid = uuid.uuid4().hex[:24].upper()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0",
        "Accept": "text/javascript, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": HOST,
        "Referer": EMBED_URL,
        "X-Tsi-Active-Tab": SHEET,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    async with aiohttp.ClientSession(headers=headers) as s:
        # Warm the session: hit the embed page so we collect cookies.
        try:
            async with s.get(EMBED_URL, timeout=aiohttp.ClientTimeout(total=30)) as r:
                _ = await r.read()
        except Exception:
            return []
        boot_url = f"{HOST}/vizql/w/{WORKBOOK}/v/{SHEET}/bootstrapSession/sessions/{sid}"
        payload = {
            "sheet_id": SHEET,
            "showParams": json.dumps(
                {
                    "checkpoint": False,
                    "refresh": False,
                    "refreshUnmodified": False,
                }
            ),
            "stickySessionKey": json.dumps(
                {
                    "workbookId": 1,
                    "featureFlags": "{}",
                    "isAuthoring": False,
                    "viewId": 1,
                }
            ),
        }
        try:
            async with s.post(boot_url, data=payload, timeout=aiohttp.ClientTimeout(total=60)) as r:
                body = await r.text(errors="replace")
        except Exception as e:
            log.warning("AISC tableau bootstrap fetch failed: %s", e)
            return []

    boot = _decode_bootstrap_response(body)
    if not boot:
        log.info("AISC tableau bootstrap returned non-JSON (likely changed protocol).")
        return []

    # Extract data
    segments = _extract_data_dictionary(boot)
    cols = _flatten_columns(segments)
    strings = cols.get("cstring", []) or cols.get("string", []) or []
    log.info("AISC tableau bootstrap OK: %d string values", len(strings))

    # Strings are the underlying values for the worksheet. Heuristic: scan
    # for adjacent (Company, City, ST) triples.
    records: list[VendorRecord] = []
    seen = set()
    i = 0
    while i < len(strings) - 2:
        company = (strings[i] or "").strip()
        city = (strings[i + 1] or "").strip()
        state = (strings[i + 2] or "").strip()
        if (
            company
            and 4 <= len(company) <= 150
            and re.search(r"[A-Za-z]", company)
            and re.match(r"^[A-Za-z .'\-]{2,30}$", city or "")
            and re.match(r"^[A-Z]{2}$", state or "")
            and company not in seen
        ):
            seen.add(company)
            records.append(
                VendorRecord(
                    company_name=company,
                    headquarters_location=f"{city}, {state}",
                    certifications_held=["AISC Certified"],
                    primary_business_type="Steel Fabricator",
                    materials_handled=["Carbon Steel"],
                    key_personnel=[],
                    data_source="AISC Tableau",
                )
            )
            i += 3
            continue
        i += 1
    return records


class AISCTableauSource:
    name = "AISC"

    def __init__(self, html_scrape, db):
        self.html_scrape = html_scrape  # async (url, wait_ms, scroll) -> markdown
        self.db = db

    async def discover(self) -> AsyncIterator[VendorRecord]:
        records = await fetch_aisc_tableau()
        if not records:
            # Fallback to Local Scraper-rendered viz
            log.info("AISC: bootstrap returned 0 — falling back to Local Scraper render")
            md = await self.html_scrape(EMBED_URL, wait_ms=10000, scroll=True)
            if md:
                seen = set()
                for line in md.splitlines():
                    line = line.strip(" *|-•\t")
                    m = re.match(
                        r"^([A-Z][A-Za-z0-9&.,'\- ]{3,120})\s*\|\s*([A-Za-z .'\-]+)\s*\|\s*([A-Z]{2})\b",
                        line,
                    )
                    if m:
                        cn = m.group(1).strip()
                        if cn in seen:
                            continue
                        seen.add(cn)
                        records.append(
                            VendorRecord(
                                company_name=cn,
                                headquarters_location=f"{m.group(2).strip()}, {m.group(3)}",
                                certifications_held=["AISC Certified"],
                                primary_business_type="Steel Fabricator",
                                materials_handled=["Carbon Steel"],
                                key_personnel=[],
                                data_source="AISC Tableau (Local Scraper)",
                            )
                        )
        log.info("AISC source emitted %d records", len(records))
        for v in records:
            yield v
