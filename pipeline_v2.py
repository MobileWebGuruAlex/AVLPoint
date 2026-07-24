"""AVLpoint.com Pipeline - Multi-source vendor ingestion pipeline.

Architecture:
  - Discovery workers fan out across all sources concurrently. Each yields
    VendorRecords into a single async queue.
  - A consumer drains the queue and pushes into the batched DB writer.
  - Once a full discovery sweep finishes (or as it streams), enrichment
    workers pull stale/incomplete vendors from the DB and re-flush them.
  - A metrics task prints records/hour every 30 s.

There is NO fixed sleep between cycles. After each pass the loop checks for
new URLs (via the sources' own cursors/dedupe) and runs again immediately;
only if a pass yields zero records does it back off briefly.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import sys
import time
from contextlib import suppress

from dotenv import load_dotenv

from db_async import AsyncDB, VendorRecord
from enrichment import enrich_batch
from http_client import ConcurrentClient, FatalAPIError, CreditExhaustedError
from startup_validator import run_startup_validation
from sources.asme import ASMESource
from sources.cema_wp import CEMASource
from sources.epa_echo import EPAEchoSource
from sources.industrynet import IndustryNetSource
from sources.iqs import IQSSource
from sources.macraes import MacRAEsSource
from sources.opencorporates import OpenCorporatesSource
from sources.overpass import OverpassSource
from sources.registries import build_all_registries
from sources.tableau_aisc import AISCTableauSource
from sources.thefabricator import TheFabricatorSource
from sources.thomasnet import ThomasnetSource
from sources.wikidata import WikidataSource
from sources.duckduckgo_discovery import DuckDuckGoDiscoverySource

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
log = logging.getLogger("pipeline")





async def metrics_loop(db: AsyncDB, started_at: float, stop: asyncio.Event):
    """Print throughput every 30 s, separated by US vs International."""
    import aiosqlite
    last_count = db.written
    last_t = time.monotonic()
    
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            pass
            
        now = time.monotonic()
        delta = db.written - last_count
        dt = now - last_t
        rate_per_hr = (delta / dt) * 3600 if dt > 0 else 0
        total = await db.count()
        
        # Pull US vs Intl stats
        us_discovered = 0
        intl_discovered = 0
        us_enriched = 0
        intl_enriched = 0
        
        async with aiosqlite.connect(db.db_path, timeout=60.0) as conn:
            await conn.execute("PRAGMA query_only=ON")
            
            async with conn.execute(
                "SELECT CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 1 ELSE 0 END as is_us, "
                "CASE WHEN (contact_email IS NOT NULL AND contact_email != '') OR (contact_phone IS NOT NULL AND contact_phone != '') OR (certifications_held IS NOT NULL AND certifications_held != '[]') THEN 1 ELSE 0 END as is_enriched, "
                "COUNT(*) FROM vendors GROUP BY is_us, is_enriched"
            ) as cur:
                async for row in cur:
                    is_us, is_enriched, count = row
                    if is_us:
                        us_discovered += count
                        if is_enriched: us_enriched += count
                    else:
                        intl_discovered += count
                        if is_enriched: intl_enriched += count
        
            async with conn.execute(
                "SELECT CASE WHEN data_source LIKE 'LocalSearch%' THEN 'Local Scraper' "
                "WHEN data_source LIKE 'NimblewaySearch%' THEN 'Nimbleway' "
                "ELSE 'Other' END as source_type, COUNT(*) "
                "FROM vendors GROUP BY source_type"
            ) as cur:
                source_counts = {"Local Scraper": 0, "Nimbleway": 0, "Other": 0}
                async for row in cur:
                    source_type, count = row
                    source_counts[source_type] += count
                    
        log.info("="*60)
        log.info("DATABASE PROGRESS METRICS (U.S. FIRST PRIORITY)")
        log.info("="*60)
        log.info(f"Total Database:   {total} records (Rate: {rate_per_hr:.0f} rec/hr)")
        log.info(f"U.S. Discovered:  {us_discovered}")
        log.info(f"U.S. Enriched:    {us_enriched}")
        log.info(f"Intl Discovered:  {intl_discovered}")
        log.info(f"Intl Enriched:    {intl_enriched}")
        log.info(f"Written Session:  {db.written} records")
        log.info("-" * 60)
        log.info("Data Sources:")
        log.info(f"  Local Scraper Search: {source_counts['Local Scraper']}")
        log.info(f"  Nimbleway Search: {source_counts['Nimbleway']}")
        log.info(f"  Other Sources:    {source_counts['Other']}")
        log.info("="*60)

        last_count = db.written
        last_t = now


async def discovery_consumer(queue: asyncio.Queue, db: AsyncDB, stop: asyncio.Event):
    while not (stop.is_set() and queue.empty()):
        try:
            v = await asyncio.wait_for(queue.get(), timeout=2.0)
        except asyncio.TimeoutError:
            continue
        await db.put(v)


async def run_source(name: str, src, queue: asyncio.Queue):
    n = 0
    try:
        async for vendor in src.discover():
            await queue.put(vendor)
            n += 1
            if n % 50 == 0:
                log.info("[%s] discovered %d", name, n)
    except Exception:
        log.exception("Source %s crashed", name)
    log.info("[%s] discovery finished with %d records", name, n)


async def run_enrichment_loop(db: AsyncDB, stop: asyncio.Event,
                               batch: int = 50, idle_sleep: float = 10.0,
                               cap: int = 0):
    processed = 0
    session_seen: set[str] = set()  # Prevent re-enrichment within same session
    consecutive_empty = 0  # Track how many times in a row we got all-seen results
    while not stop.is_set():
        if cap and processed >= cap:
            log.info("Enrichment cap reached (%d/%d) — pausing", processed, cap)
            await asyncio.sleep(idle_sleep)
            return
        limit = batch if not cap else min(batch, cap - processed)
        targets = await db.get_enrich_targets(limit=limit)
        if not targets:
            log.info("No enrichment targets found in DB. Queue exhausted — exiting session.")
            return  # Nothing left — exit; next run starts fresh
        vendors = [VendorRecord(
            company_name=t["company_name"],
            website_url=t.get("website_url"),
            headquarters_location=t.get("headquarters_location"),
            street_address=t.get("street_address"),
            city=t.get("city"),
            state_province=t.get("state_province"),
            zip_postal_code=t.get("zip_postal_code"),
            country=t.get("country"),
            facility_size_sqft=t.get("facility_size_sqft"),
            certifications_held=t.get("certifications_held") or [],
            primary_business_type=t.get("primary_business_type"),
            materials_handled=t.get("materials_handled") or [],
            contact_email=t.get("contact_email"),
            contact_phone=t.get("contact_phone"),
            key_personnel=t.get("key_personnel") or [],
            year_established=t.get("year_established"),
            thomasnet_profile_url=t.get("thomasnet_profile_url"),
            data_source=t.get("data_source") or "",
            services=t.get("services") or [],
            capabilities=t.get("capabilities") or [],
            welding_processes=t.get("welding_processes") or [],
            industries_served=t.get("industries_served") or [],
            employee_count=t.get("employee_count"),
            company_description=t.get("company_description"),
            social_profiles=t.get("social_profiles"),
            lifecycle_stage=t.get("lifecycle_stage") or "discovered",
            enterprise_tier=int(t.get("enterprise_tier") or 0),
            ai_synopsis=t.get("ai_synopsis"),
            ai_metadata_data=t.get("ai_metadata_data"),
            enrichment_attempts=t.get("enrichment_attempts") or 0,
        ) for t in targets if t["company_name"] not in session_seen]
        if not vendors:
            consecutive_empty += 1
            if consecutive_empty >= 3:
                log.info(
                    "Session queue exhausted: all %d targets from DB already processed "
                    "this session. Exiting enrichment — next run will pick up fresh work.",
                    len(targets)
                )
                return  # Exit cleanly; next scheduler run starts with empty session_seen
            log.info("All %d targets already processed this session. Sleeping %ds (attempt %d/3).",
                     len(targets), idle_sleep, consecutive_empty)
            await asyncio.sleep(idle_sleep)
            continue
        consecutive_empty = 0  # Reset counter on successful new batch
        # Mark as seen BEFORE enrichment to prevent re-selection within this session
        for v in vendors:
            session_seen.add(v.company_name)

        for attempt in range(1):  # no batch-level retries — a crash shouldn't re-bill the whole batch
            try:
                n = await enrich_batch(db, vendors, use_llm_fallback=True)
                processed += len(vendors)
                log.info("Enriched %d vendors (cum %d this session)", n, processed)
                break

            except CreditExhaustedError:
                # OpenRouter returned 402 — credits are depleted.
                # Exit cleanly; scheduler will retry once credits are topped up.
                log.warning(
                    "OpenRouter credits exhausted (HTTP 402). "
                    "Enrichment phase exiting — will resume automatically once credits are available."
                )
                return

            except FatalAPIError as e:
                log.error("Fatal API Error encountered: %s. Aborting pipeline.", e)
                raise
            except Exception as e:
                log.warning("Enrichment batch crashed on attempt %d: %s", attempt + 1, e)
                await asyncio.sleep(5)
        else:
            log.error("Enrichment batch failed after 3 attempts, skipping batch.")

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-enrich", action="store_true")
    parser.add_argument(
        "--sources",
        default="all",
        help="comma-separated: thomasnet,aisc,asme,registries,or 'all'",
    )
    parser.add_argument("--max-concurrency", type=int, default=100)
    parser.add_argument("--once", action="store_true", help="run a single discovery pass then exit")
    parser.add_argument("--max-pages", type=int, default=15,
                        help="Thomasnet states-per-heading cap (use small values to bound credits)")

    parser.add_argument("--enrich-cap", type=int, default=0,
                        help="max vendors to enrich per loop iteration (0 = unlimited)")
    parser.add_argument("--enrich-only", action="store_true",
                        help="skip discovery; only run enrichment over existing DB")
    parser.add_argument("--max-runtime", type=int, default=0, help="maximum runtime in minutes before graceful shutdown")
    args, _ = parser.parse_known_args()
    
    load_dotenv(override=True)

    # --- FAIL-FAST STARTUP VALIDATION ---
    # Validates API key, model availability, and runs a live smoke test.
    # Exits with code 1 and a clear error message if anything is misconfigured.
    # Also auto-migrates deprecated model IDs (e.g. claude-3.5-sonnet -> claude-sonnet-4).
    await run_startup_validation(fail_fast=True)

    db = AsyncDB("vendors.db")
    await db.open()
    
    stop = asyncio.Event()



    def _shutdown(*_):
        log.info("Shutdown signal received")
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            asyncio.get_event_loop().add_signal_handler(sig, _shutdown)

    async with ConcurrentClient(total_concurrency=args.max_concurrency) as http:
        # Use a local HTTP markdown scraper
        import bs4
        import markdownify
        
        nimble_key = os.getenv("NIMBLE_API_KEY")
        firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
        
        async def html_scrape(url, wait_ms=0, scroll=False):
            """Fetch via basic HTTP, then Firecrawl, then Nimbleway."""
            try:
                import aiohttp
                import bs4
                import markdownify
                
                md = ""
                
                # 1. Try free basic HTTP first
                fallback = await http.get(url, timeout=15.0)
                html = fallback.text if fallback else ""
                
                needs_js = False
                if html:
                    soup = bs4.BeautifulSoup(html, "html.parser")
                    for e in soup(["script", "style", "nav", "footer", "header", "aside"]):
                        e.decompose()
                    md = markdownify.markdownify(str(soup), heading_style="ATX")
                    if len(md.strip()) < 200:
                        needs_js = True
                        md = ""
                else:
                    needs_js = True
                    
                # 2. Try Firecrawl (Primary Paid)
                use_firecrawl = os.getenv("USE_FIRECRAWL", "true").lower() == "true"
                if needs_js and firecrawl_key and use_firecrawl:
                    headers = {"Authorization": f"Bearer {firecrawl_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "formats": ["markdown"]}
                    async with aiohttp.ClientSession() as session:
                        async with session.post("https://api.firecrawl.dev/v2/scrape", json=payload, headers=headers, timeout=45) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                if data.get("success") and "data" in data:
                                    md = data["data"].get("markdown", "")
                                    if len(md) > 100:
                                        needs_js = False
                                        log.info("Firecrawl discovery scrape success: %s", url)

                # 3. Try Nimbleway Extract (Fallback)
                if needs_js and nimble_key:
                    headers = {"Authorization": f"Bearer {nimble_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "render": True}
                    async with aiohttp.ClientSession() as session:
                        async with session.post("https://sdk.nimbleway.com/v1/extract", json=payload, headers=headers, timeout=45.0) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                html = data.get("content", "") or data.get("html", "")
                                if not html and isinstance(data.get("data"), dict):
                                    html = data["data"].get("html", "")
                                if html:
                                    soup = bs4.BeautifulSoup(html, "html.parser")
                                    for e in soup(["script", "style", "nav", "footer", "header", "aside"]):
                                        e.decompose()
                                    md = markdownify.markdownify(str(soup), heading_style="ATX")
                                    log.info("Nimbleway discovery scrape success: %s", url)
                                    
                return md
            except Exception as e:
                log.warning("html_scrape failed for %s: %s", url, e)
                return ""

        sources = []
        wanted = {s.strip().lower() for s in args.sources.split(",") if s.strip()}
        if "all" in wanted:
            wanted = {
                "thomasnet", "aisc", "asme", "registries", "iqs",
                "opencorporates", "epa", "macraes", "fabricator", "industrynet",
                "overpass", "wikidata", "ddg-discovery", "nimbleway-search", "firecrawl-discovery"
            }
        if "thomasnet" in wanted:
            sources.append(ThomasnetSource(http, html_scrape, db, max_pages_per_heading=args.max_pages))
        if "aisc" in wanted:
            sources.append(AISCTableauSource(html_scrape, db))
        if "asme" in wanted:
            sources.append(ASMESource(http, html_scrape, db))
        if "registries" in wanted:
            sources.extend(build_all_registries(html_scrape))
            sources.append(CEMASource())
        if "iqs" in wanted:
            sources.append(IQSSource())
        if "opencorporates" in wanted:
            sources.append(OpenCorporatesSource(db, max_lookups=40))
        if "epa" in wanted:
            sources.append(EPAEchoSource())
        if "macraes" in wanted:
            sources.append(MacRAEsSource(html_scrape))
        if "fabricator" in wanted:
            sources.append(TheFabricatorSource(html_scrape))
        if "industrynet" in wanted:
            sources.append(IndustryNetSource(html_scrape))

        if "nimbleway-search" in wanted:
            nimble_key = os.getenv("NIMBLE_API_KEY")
            if nimble_key:
                from sources.nimbleway_search import NimblewaySearchSource
                sources.append(NimblewaySearchSource(nimble_key, db, max_queries=20000))
            else:
                log.warning("NIMBLE_API_KEY missing. NimblewaySearchSource disabled.")
        if "overpass" in wanted:
            sources.append(OverpassSource())
        if "wikidata" in wanted:
            sources.append(WikidataSource())
        if "ddg-discovery" in wanted:
            sources.append(DuckDuckGoDiscoverySource(db))
        if "firecrawl-discovery" in wanted:
            firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
            use_firecrawl = os.getenv("USE_FIRECRAWL", "true").lower() == "true"
            if firecrawl_key and use_firecrawl:
                from sources.firecrawl_discovery import FirecrawlDiscoverySource
                sources.append(FirecrawlDiscoverySource(firecrawl_key, db, max_queries=2000))
            else:
                log.warning("FIRECRAWL_API_KEY missing. FirecrawlDiscoverySource disabled.")

        started = time.monotonic()
        queue: asyncio.Queue = asyncio.Queue(maxsize=2000)

        metrics_task = asyncio.create_task(metrics_loop(db, started, stop))
        consumer_task = asyncio.create_task(discovery_consumer(queue, db, stop))

        enrich_task = None
        if not args.no_enrich:
            enrich_task = asyncio.create_task(
                run_enrichment_loop(db, stop, idle_sleep=5.0, cap=args.enrich_cap)
            )



        async def discovery_pass():
            log.info("Starting discovery pass across %d sources", len(sources))
            tasks = [asyncio.create_task(run_source(s.name, s, queue)) for s in sources]
            await asyncio.gather(*tasks, return_exceptions=True)
            log.info("Discovery pass complete (written so far: %d)", db.written)

        if args.enrich_only:
            log.info("--enrich-only set; skipping discovery")
            # Run enrichment until cap reached, then exit
            if enrich_task:
                await enrich_task
        elif args.once:
            await discovery_pass()
            # Drain queue
            while not queue.empty():
                await asyncio.sleep(0.2)
            await asyncio.sleep(3)
        else:
            while not stop.is_set():
                await discovery_pass()
                if stop.is_set():
                    break
                log.info("Full discovery pass complete. Sleeping for 2 hours before next cycle.")
                await asyncio.sleep(7200) # 2-hour cycle

        stop.set()
        await consumer_task
        if enrich_task:
            await asyncio.sleep(2)
            enrich_task.cancel()
            with suppress(asyncio.CancelledError):
                await enrich_task
        metrics_task.cancel()
        with suppress(asyncio.CancelledError):
            await metrics_task

    await db.close()
    log.info("Pipeline shut down cleanly. Total written this session: %d", db.written)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Interrupted")
