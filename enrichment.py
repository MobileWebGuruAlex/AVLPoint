"""Single-tier enrichment with Zero-Waste Protocol.

Tier A (free): batch_scrape -> regex/parse. Fills 80% of fields.
Tier B (paid): Sonnet via OpenRouter ONLY for missing fields, using cached markdown.

Integrates OpenCorporates and EPA ECHO as free pre-LLM checks.

Architectural safeguards (updated 2026-07-07):
  - No Haiku triage gate: enterprise_tier pre-filter does equivalent work at zero cost.
  - Per-session hard credit ceiling: SESSION_CREDIT_LIMIT_USD env var (default $7.00).
  - Per-company spend guard: PER_COMPANY_SPEND_LIMIT_USD env var (default $0.50).
  - CreditExhaustedError propagates cleanly from Sonnet path to pipeline_v2 exit.
  - enrichment_attempts counter: after 3 failures, vendor is quarantined automatically.
  - Prompt truncated to 12,000 chars (~3,000 tokens) sufficient for full profile extraction.
  - 24h cooldown exempts never-enriched vendors (0 attempts, no synopsis) so scraper
    touches do not block them from receiving their first Sonnet call.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Iterable

import aiohttp

from db_async import AsyncDB, VendorRecord
from sources.parsers import parse_profile_markdown, find_phone, find_email, find_location
import bs4
import re
from sources.parsers import parse_profile_markdown
import markdownify
from sources.opencorporates import _search_name, _to_vendor_from_search, HEADERS as OC_HEADERS
from http_client import ConcurrentClient, CreditExhaustedError

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

log = logging.getLogger("enrich")


def _merge(vendor: VendorRecord, parsed: dict) -> tuple[VendorRecord, bool]:
    """Merge parsed fields into vendor; returns (vendor, changed?)."""
    changed = False
    if not parsed:
        return vendor, False

    SCALAR_FILLS = [
        "contact_email", "contact_phone", "facility_size_sqft",
        "year_established", "primary_business_type", "headquarters_location",
        "website_url", "logo_url", "employee_count", "company_description",
        "contact_form_url", "shop_capacity",
        "street_address", "city", "state_province", "zip_postal_code", "country",
        "ai_summary",
    ]
    for field in SCALAR_FILLS:
        val = parsed.get(field)
        if val and not getattr(vendor, field, None):
            setattr(vendor, field, val)
            changed = True

    # ai_synopsis and ai_metadata_data are AUTHORITATIVE LLM outputs, regenerated
    # deliberately to upgrade old short profiles — so they OVERWRITE rather than
    # fill-only. Guard against regressions: never replace a longer synopsis with a
    # shorter one (protects already-upgraded records if a later scrape is thin).
    new_syn = parsed.get("ai_synopsis")
    if new_syn:
        cur_syn = str(getattr(vendor, "ai_synopsis", "") or "")
        if len(str(new_syn)) >= len(cur_syn) and str(new_syn) != cur_syn:
            vendor.ai_synopsis = new_syn
            changed = True
    new_meta = parsed.get("ai_metadata_data")
    if new_meta and new_meta != getattr(vendor, "ai_metadata_data", None):
        vendor.ai_metadata_data = new_meta
        changed = True

    if parsed.get("language_barrier_needs_approval"):
        if not getattr(vendor, "language_needs_approval", False):
            vendor.language_needs_approval = True
            changed = True

    if parsed.get("social_profiles"):
        existing = {}
        if vendor.social_profiles:
            try:
                existing = json.loads(vendor.social_profiles) if isinstance(vendor.social_profiles, str) else {}
            except Exception:
                existing = {}
        new_profiles = parsed["social_profiles"]
        if isinstance(new_profiles, str):
            try:
                new_profiles = json.loads(new_profiles)
            except Exception:
                new_profiles = {}
        if isinstance(new_profiles, dict):
            merged = {**existing, **new_profiles}
            if merged != existing:
                vendor.social_profiles = json.dumps(merged)
                changed = True

    LIST_MERGES = [
        "certifications_held", "materials_handled", "key_personnel",
        "welding_processes", "services", "capabilities",
        "fabrication_capabilities", "industries_served", "memberships",
        "equipment_list", "geographic_service_areas", "images",
        "license_numbers", "registration_numbers", "representative_images",
        "alternate_names", "sub_industries", "products", "additional_locations",
        "keywords", "search_tags", "use_cases", "vendor_categories",
        "project_types", "technical_specialties", "partnerships_and_dealers",
        "inspection_and_qa_capabilities", "notable_customers",
    ]
    for field in LIST_MERGES:
        new_vals = parsed.get(field)
        if new_vals and isinstance(new_vals, (list, set)):
            before = set(getattr(vendor, field, None) or [])
            merged = set(before)
            merged.update(new_vals)
            if merged != before:
                setattr(vendor, field, sorted(merged))
                changed = True

    return vendor, changed


def _candidates(vendor: VendorRecord) -> list[str]:
    """Pages worth scraping to enrich this vendor."""
    base = (vendor.website_url or "").rstrip("/")
    if base:
        urls = [base]
        for suffix in ["/about", "/about-us", "/capabilities", "/contact", "/services"]:
            urls.append(f"{base}{suffix}")
        return urls[:3]  # cap at 3 pages per vendor
    if vendor.thomasnet_profile_url:
        return [vendor.thomasnet_profile_url]
    return []


def _needs_llm(v: VendorRecord) -> bool:
    return not (v.ai_synopsis and v.representative_images)


def _get_missing_fields(v: VendorRecord) -> list[str]:
    missing = []
    if not v.contact_email: missing.append("contact_email")
    if not v.contact_phone: missing.append("contact_phone")
    if not v.key_personnel: missing.append("key_personnel")
    if not v.facility_size_sqft: missing.append("facility_size_sqft")
    if not v.year_established: missing.append("year_established")
    if not v.headquarters_location: missing.append("headquarters_location")
    if not v.street_address: missing.append("street_address")
    if not v.certifications_held: missing.append("certifications_held")
    if not v.company_description: missing.append("company_description")
    if not v.services: missing.append("services")
    if not v.ai_synopsis: missing.append("ai_synopsis")
    if not v.representative_images: missing.append("representative_images")
    return missing


async def enrich_batch(db: AsyncDB, vendors: list[VendorRecord], use_llm_fallback: bool = True, batch_size: int = 50) -> int:
    """Enriches a batch of vendors. Returns the number of records successfully updated."""
    updated = 0
    updated_vendors: set[str] = set()
    if not vendors:
        return 0

    log.info("Starting enrich_batch with %d vendors", len(vendors))

    # PRE-TIER: OpenCorporates (free)
    async with aiohttp.ClientSession(headers=OC_HEADERS) as oc_session:
        api_token = os.environ.get("OPENCORPORATES_API_KEY")
        async def do_oc(v):
            if not api_token:
                return
            if not v.headquarters_location or not v.year_established:
                try:
                    matches = await _search_name(oc_session, v.company_name, api_token)
                    if matches:
                        best = None
                        low = v.company_name.lower()[:8]
                        for m in matches:
                            cn = (m.get("company", {}).get("name") or "").lower()
                            if cn[:8] == low or low in cn:
                                best = m
                                break
                        best = best or matches[0]
                        oc_v = _to_vendor_from_search(best, "name-xref")
                        if oc_v:
                            parsed = {
                                "headquarters_location": oc_v.headquarters_location,
                                "year_established": oc_v.year_established,
                            }
                            _, changed = _merge(v, parsed)
                            if changed:
                                updated_vendors.add(v.company_name)
                except Exception as e:
                    log.warning("OpenCorporates enrichment failed for %s: %s", v.company_name, e)
        await asyncio.gather(*[do_oc(v) for v in vendors])

    # PRE-TIER 2: DuckDuckGo — disabled (primp Rust panics crash the process)
    if False and DDGS is not None:
        pass

    # PRE-TIER 3: EPA ECHO Facility Search (free)
    async with aiohttp.ClientSession() as epa_session:
        async def do_epa(v):
            if not v.headquarters_location or not v.city:
                try:
                    params = {"output": "JSON", "p_fn": v.company_name, "responseset": "10"}
                    async with epa_session.get(
                        "https://echodata.epa.gov/echo/echo_rest_services.get_facilities",
                        params=params, timeout=10
                    ) as r:
                        if r.status == 200:
                            data = await r.json(content_type=None)
                            facs = data.get("Results", {}).get("Facilities", [])
                            if facs and isinstance(facs, list):
                                fac = facs[0]
                                parsed = {}
                                street = fac.get("FacStreet", "").strip()
                                city   = fac.get("FacCity",   "").strip()
                                state  = fac.get("FacState",  "").strip()
                                zipc   = fac.get("FacZip",    "").strip()[:5]
                                if street: parsed["street_address"]  = street
                                if city:   parsed["city"]             = city
                                if state:  parsed["state_province"]   = state
                                if zipc:   parsed["zip_postal_code"]  = zipc
                                loc_parts = [p for p in (city, state) if p]
                                if loc_parts: parsed["headquarters_location"] = ", ".join(loc_parts)
                                if parsed:
                                    _, changed = _merge(v, parsed)
                                    if changed:
                                        updated_vendors.add(v.company_name)
                except Exception as e:
                    log.debug("EPA ECHO name search failed for %s: %s", v.company_name, e)

        sem_epa = asyncio.Semaphore(10)
        async def bounded_epa(v):
            async with sem_epa:
                await do_epa(v)
                await asyncio.sleep(0.2)
        await asyncio.gather(*[bounded_epa(v) for v in vendors])

    await asyncio.sleep(0.250)

    # Tier A: Free HTML/Regex Scraper
    log.info("Enrich Tier A: Scrape for %d vendors", len(vendors))

    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    # Enrichment can run against the direct Anthropic API (same funded key that powers
    # the website's AI layer) instead of OpenRouter. AVL_ENRICH_PROVIDER=anthropic|openrouter|auto;
    # "auto" (default) prefers Anthropic whenever a key is present, since it avoids the
    # separate OpenRouter balance entirely.
    anthropic_api_key = os.getenv("AVL_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    _provider = os.getenv("AVL_ENRICH_PROVIDER", "auto").lower()
    use_anthropic = _provider == "anthropic" or (_provider == "auto" and bool(anthropic_api_key))
    anthropic_model = os.getenv("AVL_AI_MODEL", "claude-sonnet-4-6")
    anthropic_base = os.getenv("AVL_AI_BASE_URL", "https://api.anthropic.com").rstrip("/")
    FC_SESSION_LIMIT = int(os.getenv("FIRECRAWL_SESSION_LIMIT", "500"))
    fc_session_spend = [0]
    fc_lock = asyncio.Lock()

    def _parse_html(html: str, url: str) -> tuple[dict, str, int]:
        parsed = {}
        soup = bs4.BeautifulSoup(html, "html.parser")
        
        logo_url = None
        meta_img = soup.find("meta", property="og:image")
        if meta_img and meta_img.get("content"):
            logo_url = meta_img["content"]
        if not logo_url:
            link_icon = soup.find("link", rel=lambda r: r and "icon" in r.lower())
            if link_icon and link_icon.get("href"):
                logo_url = link_icon["href"]
        if not logo_url:
            img_logo = soup.find("img", attrs={"src": re.compile(r'logo', re.I)})
            if img_logo and img_logo.get("src"):
                logo_url = img_logo["src"]
        if logo_url:
            from urllib.parse import urljoin
            parsed["logo_url"] = urljoin(url, logo_url)

        from urllib.parse import urljoin
        rep_images = []
        for img in soup.find_all("img"):
            src = img.get("src")
            if not src: continue
            if any(x in src.lower() for x in ["icon", "logo", "tracker", "pixel", "badge"]): continue
            w = img.get("width"); h = img.get("height")
            try:
                if w and int(w) < 150: continue
                if h and int(h) < 150: continue
            except ValueError: pass
            abs_url = urljoin(url, src)
            if abs_url not in rep_images and abs_url != parsed.get("logo_url"):
                rep_images.append(abs_url)
            if len(rep_images) >= 3: break
        if rep_images: parsed["representative_images"] = rep_images

        desc = soup.find("meta", attrs={"name": "description"})
        if desc and desc.get("content"): parsed["company_description"] = desc["content"].strip()

        text = soup.get_text(separator=" ", strip=True)
        for tag in soup(["script", "style", "svg", "noscript", "meta", "link", "header", "footer"]):
            tag.extract()
        try:
            md_text = markdownify.markdownify(str(soup), heading_style="ATX")
        except Exception:
            md_text = soup.get_text(separator=" ", strip=True)

        phone = find_phone(text)
        email = find_email(text)
        if phone: parsed["contact_phone"] = phone
        if email: parsed["contact_email"] = email

        services = set()
        for heading in soup.find_all(["h1", "h2", "h3"]):
            htext = heading.get_text(strip=True).lower()
            if "service" in htext or "capabilit" in htext or "process" in htext:
                ul = heading.find_next_sibling("ul")
                if ul:
                    for li in ul.find_all("li"):
                        services.add(li.get_text(strip=True))
        if services: parsed["services"] = list(services)

        certs = set()
        if re.search(r'\bISO\s*9001\b', text, re.I): certs.add("ISO 9001")
        if re.search(r'\bAS\s*9100\b', text, re.I):  certs.add("AS9100")
        if re.search(r'\bAWS\s*Certified\b', text, re.I): certs.add("AWS Certified")
        if certs: parsed["certifications_held"] = list(certs)
        
        return parsed, md_text, len(text)

    async def scrape_url(session, url: str) -> tuple[dict, str]:
        import hashlib
        import json
        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_file = os.path.join("fc_cache", f"{url_hash}.json")
        
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cdata = json.load(f)
                    return cdata.get("parsed", {}), cdata.get("md_text", "")
            except Exception:
                pass

        parsed: dict = {}
        md_text = ""
        aiohttp_failed = False
        needs_js = False

        try:
            # 1. Fallback to basic aiohttp scraper FIRST to save credits
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    parsed, md_text, text_len = _parse_html(html, url)
                    if text_len < 300:
                        needs_js = True # Likely JS-heavy, React, or extremely empty
                elif resp.status in (401, 403, 503, 429):
                    aiohttp_failed = True # Likely WAF / Cloudflare block
                else:
                    aiohttp_failed = True
        except Exception as e:
            log.debug("aiohttp failed for %s: %s", url, e)
            aiohttp_failed = True

        # 2. Try Firecrawl API as PRIMARY PAID tool
        if aiohttp_failed or needs_js:
            firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
            use_firecrawl = os.getenv("USE_FIRECRAWL", "true").lower() == "true"
            if firecrawl_key and use_firecrawl:
                can_use_fc = False
                async with fc_lock:
                    if fc_session_spend[0] < FC_SESSION_LIMIT:
                        fc_session_spend[0] += 1
                        can_use_fc = True

                if can_use_fc:
                    try:
                        headers = {"Authorization": f"Bearer {firecrawl_key}", "Content-Type": "application/json"}
                        payload = {"url": url, "formats": ["markdown"]}
                        async with session.post("https://api.firecrawl.dev/v2/scrape", json=payload, headers=headers, timeout=45) as fc_resp:
                            if fc_resp.status == 200:
                                data = await fc_resp.json()
                                if data.get("success") and "data" in data:
                                    result = data["data"]
                                    md_text = result.get("markdown", "")
                                    metadata = result.get("metadata", {})
                                    
                                    if metadata.get("ogImage"):
                                        parsed["logo_url"] = metadata["ogImage"]
                                    if metadata.get("description"):
                                        parsed["company_description"] = metadata["description"]
                                    
                                    phone = find_phone(md_text)
                                    email = find_email(md_text)
                                    if phone: parsed["contact_phone"] = phone
                                    if email: parsed["contact_email"] = email
                                    
                                    aiohttp_failed = False
                                    needs_js = False
                                    log.debug("Firecrawl Extract succeeded for %s", url)
                    except Exception as e:
                        log.debug("Firecrawl scrape fallback failed for %s: %s", url, e)

        # 3. Try Nimbleway Extract ONLY if Firecrawl failed (conserve Nimbleway credits)
        if aiohttp_failed or needs_js:
            nimble_key = os.getenv("NIMBLE_API_KEY")
            if nimble_key:
                try:
                    headers = {"Authorization": f"Bearer {nimble_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "render": True}
                    async with session.post("https://sdk.nimbleway.com/v1/extract", json=payload, headers=headers, timeout=30) as n_resp:
                        if n_resp.status == 200:
                            data = await n_resp.json()
                            html = data.get("content", "") or data.get("html", "")
                            if not html and isinstance(data.get("data"), dict):
                                html = data["data"].get("html", "")
                            if html:
                                parsed, md_text, text_len = _parse_html(html, url)
                                if text_len > 300:
                                    aiohttp_failed = False
                                    needs_js = False
                                    log.debug("Nimbleway Extract succeeded for %s", url)
                except Exception as e:
                    log.debug("Nimbleway scrape fallback failed for %s: %s", url, e)

        if md_text:
            os.makedirs("fc_cache", exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump({"parsed": parsed, "md_text": md_text}, f)

        return parsed, md_text

    # Deduplicate URLs: each unique URL is scraped exactly once regardless of
    # how many vendors share it (e.g. thomasnet_profile_url vs website_url)
    url_to_vendor: dict[str, list[VendorRecord]] = {}
    for v in vendors:
        for u in _candidates(v):
            url_to_vendor.setdefault(u, []).append(v)

    urls = list(url_to_vendor.keys())
    parsed_map: dict[str, dict] = {}
    md_map: dict[str, str] = {}
    async with aiohttp.ClientSession() as session:
        for i in range(0, len(urls), 10):
            chunk = urls[i:i+10]
            tasks = [scrape_url(session, u) for u in chunk]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for u, r in zip(chunk, results):
                if isinstance(r, tuple) and len(r) == 2:
                    parsed_map[u] = r[0]
                    if r[1]:
                        md_map[u] = r[1]
            await asyncio.sleep(0.5)

    # Yield to event loop so aiohttp cleans up before the next session
    await asyncio.sleep(0.250)

    # Tier B: LLM Extraction (Aggregated per vendor) via the active provider.
    llm_key_present = anthropic_api_key if use_anthropic else openrouter_api_key
    if use_llm_fallback and llm_key_present:
        # --- Per-session hard credit ceiling ---
        # Sonnet via OpenRouter: $3.00/1M input, $15.00/1M output.
        #
        # SESSION_CREDIT_LIMIT_USD (default $7.00):
        #   At avg $0.013/company -> ~538 companies per 2-hour session,
        #   ~6,450/day. Sized to clear the 7,988-vendor backlog in ~1.5 days.
        #   Configurable via .env if throughput needs adjustment.
        #
        # PER_COMPANY_SPEND_LIMIT_USD (default $0.50 = ~38x average):
        #   If any single vendor consumes more than $0.50 in one session,
        #   it is quarantined immediately and the session continues on others.
        #   Prevents one broken or abnormally large record from eating the budget.
        SESSION_CREDIT_LIMIT = float(os.getenv("SESSION_CREDIT_LIMIT_USD", "1.0"))
        PER_COMPANY_LIMIT = float(os.getenv("PER_COMPANY_SPEND_LIMIT_USD", "0.05"))
        DAILY_LIMIT = float(os.getenv("ENRICH_DAILY_LIMIT_USD", "2.0"))
        # Model pricing per 1M tokens (USD). Default = gpt-4o-mini. Override via .env
        # to match whatever OPENROUTER_MODEL is set to.
        PRICE_IN = float(os.getenv("ENRICH_PRICE_IN_PER_M", "0.15"))
        PRICE_OUT = float(os.getenv("ENRICH_PRICE_OUT_PER_M", "0.60"))
        session_spend = 0.0
        company_spend: dict[str, float] = {}  # per-vendor spend tracking this session
        credit_ceiling_lock = asyncio.Lock()

        # --- HARD daily budget wall (persists across the 2-hour scheduled runs) ---
        import datetime as _dt
        _budget_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".enrich_budget.json")
        def _load_daily() -> float:
            try:
                with open(_budget_path) as f:
                    d = json.load(f)
                if d.get("date") == _dt.date.today().isoformat():
                    return float(d.get("spent", 0.0))
            except Exception:
                pass
            return 0.0
        def _save_daily(total: float) -> None:
            try:
                with open(_budget_path, "w") as f:
                    json.dump({"date": _dt.date.today().isoformat(), "spent": round(total, 6)}, f)
            except Exception:
                pass
        daily_spent = _load_daily()
        if daily_spent >= DAILY_LIMIT:
            log.warning("DAILY BUDGET already reached ($%.4f/$%.2f). Skipping all LLM this run.", daily_spent, DAILY_LIMIT)
            use_llm_fallback = False

        async def _check_and_charge(prompt_tokens: int, completion_tokens: int, company_name: str) -> None:
            """Thread-safe credit tracker. Raises CreditExhaustedError on:
            - Daily budget wall (hard stop, survives across runs)
            - Session ceiling breach (stops entire enrichment phase)
            - Per-company limit breach (quarantines that vendor, session continues)
            """
            nonlocal session_spend, daily_spent
            cost = (prompt_tokens / 1_000_000 * PRICE_IN) + (completion_tokens / 1_000_000 * PRICE_OUT)
            async with credit_ceiling_lock:
                session_spend += cost
                daily_spent += cost
                _save_daily(daily_spent)
                company_spend[company_name] = company_spend.get(company_name, 0.0) + cost

                if daily_spent >= DAILY_LIMIT:
                    log.warning("DAILY BUDGET WALL: $%.4f spent today (limit $%.2f). Stopping enrichment.", daily_spent, DAILY_LIMIT)
                    raise CreditExhaustedError(f"Daily budget ${DAILY_LIMIT:.2f} reached at ${daily_spent:.4f}")

                # Per-company guard: quarantine if one vendor consumes disproportionate credits
                if company_spend[company_name] >= PER_COMPANY_LIMIT:
                    log.warning(
                        "PER-COMPANY LIMIT: %s consumed $%.4f (limit $%.2f). "
                        "Quarantining — session continues with other vendors.",
                        company_name, company_spend[company_name], PER_COMPANY_LIMIT,
                    )
                    await db.quarantine_vendor(company_name)
                    raise CreditExhaustedError(
                        f"Per-company limit ${PER_COMPANY_LIMIT:.2f} hit for {company_name}"
                    )

                # Session ceiling guard
                if session_spend >= SESSION_CREDIT_LIMIT:
                    log.warning(
                        "SESSION CREDIT CEILING HIT: $%.4f spent (limit $%.2f). "
                        "Stopping enrichment to protect credits.",
                        session_spend, SESSION_CREDIT_LIMIT,
                    )
                    raise CreditExhaustedError(
                        f"Session ceiling ${SESSION_CREDIT_LIMIT:.2f} reached at ${session_spend:.4f}"
                    )

        async with ConcurrentClient(total_concurrency=10, timeout_s=45) as http:
            async def process_llm(v):
                # Hard lifecycle lock: fully_built, locked, quarantined vendors are never re-enriched.
                _stage = getattr(v, 'lifecycle_stage', 'discovered')
                if _stage in ('fully_built', 'locked', 'disqualified', 'quarantined'):
                    log.debug("Skipping LLM for %s — lifecycle_stage=%s", v.company_name, _stage)
                    return

                # Skip only if the vendor already has the NEW comprehensive profile.
                # Old-format synopses (the previous 50-80 word blurbs, ~<900 chars) are
                # deliberately re-generated so curated survivors get upgraded to the full
                # 250-450 word profile; once upgraded (>=900 chars) they're left alone.
                if v.ai_synopsis and len(v.ai_synopsis) >= 900 and v.ai_metadata_data:
                    log.debug("Skipping LLM for %s — comprehensive profile already present", v.company_name)
                    return

                # Aggregate markdown for this vendor
                vendor_md = ""
                for u in _candidates(v):
                    if md_map.get(u):
                        vendor_md += f"\n\n# Page: {u}\n" + md_map[u]

                # Increment attempt counter BEFORE checking vendor_md or calling LLM so a crash or failed scrape still counts.
                await db.increment_enrichment_attempts(v.company_name)

                if not vendor_md:
                    log.warning("Scrape failed or empty for %s, skipping LLM.", v.company_name)
                    return

                # Truncate hard to 5,000 chars (~1,250 tokens). The homepage/about
                # text in the first 5k chars carries virtually all profile-relevant
                # signal; sending more just burns input tokens (the dominant cost).
                # This is THE lever that keeps per-company cost near $0.001.
                llm_text = vendor_md[:5000]

                # --- Direct Sonnet Extraction (no Haiku pre-filter) ---
                system_prompt = """You are a vendor intelligence analyst building structured supplier profiles for an enterprise Approved Vendor List (AVL) platform.

Your goal is to increase the amount of high-value, verified intelligence per company without gathering fluff or generating speculative content. DO NOT GUESS. If a field cannot be confirmed from the text, omit it entirely.

Return ONLY valid JSON matching this exact schema:
{
  "ai_synopsis": "A comprehensive, professional company profile of roughly 250-450 words (multiple paragraphs, separated by \\n\\n) that reads like a decision-grade briefing for a procurement engineer evaluating this supplier. Cover, in order and ONLY where the source supports it: (1) who the company is and exactly what they do; (2) their core manufacturing/fabrication capabilities and processes; (3) the specific products, components, or assemblies they make; (4) materials and specifications they work in; (5) quality, inspection, and certification posture (ASME, API, NBIC, ISO, AWS, NADCAP, ITAR, etc.); (6) industries and notable customers served; (7) verifiable signals of scale and credibility (facility size, employee count, year established, revenue, capacity, lead times). Write in confident, factual prose grounded entirely in the source text — never pad, speculate, or invent. If a topic is not supported by the source, simply skip it rather than filling space. This is the primary description shown on the company's profile page, so it should be thorough and specific enough that a buyer needs nothing else to decide whether to shortlist them.",
  "core_capabilities": ["Specific capability 1", "Specific capability 2"],
  "products": ["Specific product, component, or manufactured item 1", "Specific product 2"],
  "certifications": ["ISO 9001:2015", "AS9100D", "etc."],
  "industries_served": ["Aerospace", "Defense", "etc."],
  "materials_handled": ["316 Stainless Steel", "Inconel 625", "Lithium Carbonate", "Silicon Carbide", "etc."],
  "equipment_list": ["CNC 5-axis mill", "Trumpf laser cutter", "etc."],
  "notable_customers": ["Boeing", "Lockheed Martin", "etc."],
  "partnerships_and_dealers": ["OEM partner name", "Distributor name", "etc."],
  "avl_approvals": ["Approved supplier for Boeing", "Raytheon QPL listed", "NADCAP accredited", "etc."],
  "use_cases": ["Precision machining of turbine blades", "Custom pressure vessel fabrication", "etc."],
  "project_types": ["Types of jobs performed 1", "MRO services", "etc."],
  "technical_specialties": ["Tight tolerance machining \u00b10.0005", "Orbital welding", "etc."],
  "vendor_categories": ["Contract Manufacturer", "Precision Machine Shop", "Critical Mineral Processor", "Chemical Refiner", "etc."],
  "inspection_and_qa_capabilities": ["AWS-CWI", "ASNT NDT Level II/III", "In-house RT/UT", "etc."],
  "employee_count": "Number or range if stated",
  "year_established": "Year if stated",
  "facility_size_sqft": "Square footage of facilities if public",
  "itar_registered": false,
  "cage_code": "CAGE code if stated",
  "duns_number": "DUNS if stated",
  "iso_9001": false,
  "as9100": false,
  "cybersecurity_compliance": "NIST, CMMC, ISO 27001, etc.",
  "annual_revenue_estimate": "Revenue if stated",
  "lead_times": "Lead times if stated"
}

RULES:
- For notable_customers: Include ANY verified named companies, clients, OEMs, or end-users mentioned.
- For avl_approvals: Extract any evidence of formal supplier approval, qualified product listings, OEM certifications.
- For products: Be specific about what they manufacture, fabricate, or supply. Not vague categories.
- For core_capabilities: Extract exact processes and manufacturing capabilities.
- For inspection_and_qa_capabilities: Prioritize CWI, NDT, NACE inspectors, and in-house testing methods.
- For certifications: Aggressively seek ASME, API, NBIC, ISO, PED, NQA-1, and AWS standards.
- Ensure boolean flags (itar_registered, iso_9001, as9100) are true ONLY if explicitly stated.
- Connect all data into a cohesive, decision-grade profile."""

                # max_tokens 4000 so the ~250-450 word ai_synopsis plus the full structured
                # schema never truncates mid-JSON on data-rich suppliers.
                if use_anthropic:
                    model_name = anthropic_model
                    req_url = f"{anthropic_base}/v1/messages"
                    headers = {
                        "x-api-key": anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    }
                    payload = {
                        "model": model_name,
                        "max_tokens": 4000,
                        "system": system_prompt,
                        "messages": [
                            {"role": "user", "content": llm_text +
                             "\n\nReturn ONLY the JSON object described in the schema above — no prose, no markdown fences."}
                        ],
                    }
                else:
                    model_name = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")
                    req_url = "https://openrouter.ai/api/v1/chat/completions"
                    headers = {
                        "Authorization": f"Bearer {openrouter_api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://avlpoint.com",
                        "X-Title": "AVL Point",
                    }
                    payload = {
                        "model": model_name,
                        "max_tokens": 4000,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": llm_text}
                        ],
                        "response_format": {"type": "json_object"},
                    }

                try:
                    llm_data = await http.post_json(req_url, payload=payload, headers=headers)

                    # Normalize either provider's response into content + token counts.
                    if use_anthropic:
                        blocks = (llm_data or {}).get("content") or []
                        content = "".join(
                            b.get("text", "") for b in blocks
                            if isinstance(b, dict) and b.get("type") == "text"
                        )
                        usage = (llm_data or {}).get("usage", {})
                        prompt_tokens = usage.get("input_tokens", 0)
                        completion_tokens = usage.get("output_tokens", 0)
                    else:
                        choices = (llm_data or {}).get("choices") or []
                        content = choices[0]["message"]["content"] if choices else ""
                        usage = (llm_data or {}).get("usage", {})
                        prompt_tokens = usage.get("prompt_tokens", 0)
                        completion_tokens = usage.get("completion_tokens", 0)
                    # Robust fallback: some OpenRouter routes omit usage, which would let
                    # the budget wall read $0 and never trip. Estimate from char length
                    # (~4 chars/token) so the cap is never blind.
                    if not prompt_tokens:
                        prompt_tokens = (len(system_prompt) + len(llm_text)) // 4
                    if not completion_tokens:
                        completion_tokens = max(1, len(content) // 4)

                    if content:
                        content = content.strip()
                        if content.startswith("```"):
                            content = "\n".join(content.split("\n")[1:-1])
                        # Robust: keep only the outermost JSON object.
                        _s, _e = content.find("{"), content.rfind("}")
                        if _s != -1 and _e != -1:
                            content = content[_s:_e + 1]
                        llm_parsed = json.loads(content)

                        log.info(
                            "LLM Token Usage (%s): Prompt=%s, Completion=%s | Session: $%.4f",
                            model_name, prompt_tokens, completion_tokens, session_spend
                        )

                        # Charge against session and per-company ceilings
                        await _check_and_charge(prompt_tokens, completion_tokens, v.company_name)

                        # Remap LLM output keys to VendorRecord field names
                        FIELD_REMAP = {
                            "core_capabilities": "capabilities",
                            "notable_customers": "notable_customers",
                            "avl_approvals": "certifications_held",
                            "certifications": "certifications_held",
                        }
                        remapped = {}
                        for k, val in llm_parsed.items():
                            target_key = FIELD_REMAP.get(k, k)
                            if val:
                                if isinstance(val, list) and target_key in remapped and isinstance(remapped[target_key], list):
                                    remapped[target_key] = list(set(remapped[target_key] + val))
                                else:
                                    remapped[target_key] = val

                        # Store full LLM output as ai_metadata_data
                        remapped["ai_metadata_data"] = json.dumps(llm_parsed)

                        first_url = list(_candidates(v))[0]
                        if first_url not in parsed_map:
                            parsed_map[first_url] = {}
                        for k, val in remapped.items():
                            if val:
                                if isinstance(val, list):
                                    parsed_map[first_url][k] = list(set(parsed_map[first_url].get(k, []) + val))
                                else:
                                    parsed_map[first_url][k] = val

                        # Successful extraction: reset attempt counter
                        await db.reset_enrichment_attempts(v.company_name)

                except CreditExhaustedError:
                    raise  # propagate to gather result check
                except Exception as e:
                    log.warning(
                        "LLM extraction failed for %s (attempt %s): %s",
                        v.company_name,
                        getattr(v, 'enrichment_attempts', '?'),
                        e
                    )
                    attempts = await db.get_enrichment_attempts(v.company_name)
                    # Quarantine after ONE failure (was 3). A failed extraction is almost
                    # always a persistent problem (JS-only site, blocked scrape, not a real
                    # company) — retrying across runs just burns calls. Reversible via admin.
                    if attempts >= 1:
                        log.warning(
                            "QUARANTINE: %s failed %d time(s). Setting lifecycle_stage=quarantined.",
                            v.company_name, attempts
                        )
                        await db.quarantine_vendor(v.company_name)

            # Run concurrently; propagate first CreditExhaustedError (session ceiling)
            # but allow per-company limit raises to be caught per-vendor above
            tasks = [process_llm(v) for v in vendors]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            session_credit_exhausted = None
            for r in results:
                if isinstance(r, CreditExhaustedError):
                    msg = str(r)
                    if "Per-company limit" in msg:
                        # Per-company hit: already quarantined above, just log and continue
                        log.info("Per-company limit caught in gather: %s", msg)
                    else:
                        # Session ceiling hit: propagate to exit enrichment loop
                        session_credit_exhausted = r
            if session_credit_exhausted:
                raise session_credit_exhausted

    for v in vendors:
        any_change = v.company_name in updated_vendors
        for u in _candidates(v):
            parsed = parsed_map.get(u, {})
            if parsed:
                v, changed = _merge(v, parsed)
                if changed:
                    any_change = True

        if any_change:
            success = await db.put_and_wait(v)
            if success:
                updated += 1
        else:
            await db.touch_vendor(v.company_name)

    return updated
