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
        "ai_summary", "ai_synopsis", "ai_metadata_data",
    ]
    for field in SCALAR_FILLS:
        val = parsed.get(field)
        if val and not getattr(vendor, field, None):
            setattr(vendor, field, val)
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

    async def scrape_url(session, url: str) -> tuple[dict, str]:
        parsed: dict = {}
        md_text = ""
        try:
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    soup = bs4.BeautifulSoup(html, "html.parser")

                    # Logo
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

                    # Representative Images
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
                        except ValueError:
                            pass
                        abs_url = urljoin(url, src)
                        if abs_url not in rep_images and abs_url != parsed.get("logo_url"):
                            rep_images.append(abs_url)
                        if len(rep_images) >= 3:
                            break
                    if rep_images:
                        parsed["representative_images"] = rep_images

                    # Meta description
                    desc = soup.find("meta", attrs={"name": "description"})
                    if desc and desc.get("content"):
                        parsed["company_description"] = desc["content"].strip()

                    # Text + Markdown
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

                    # Services
                    services = set()
                    for heading in soup.find_all(["h1", "h2", "h3"]):
                        htext = heading.get_text(strip=True).lower()
                        if "service" in htext or "capabilit" in htext or "process" in htext:
                            ul = heading.find_next_sibling("ul")
                            if ul:
                                for li in ul.find_all("li"):
                                    services.add(li.get_text(strip=True))
                    if services:
                        parsed["services"] = list(services)

                    # Certifications
                    certs = set()
                    if re.search(r'\bISO\s*9001\b', text, re.I): certs.add("ISO 9001")
                    if re.search(r'\bAS\s*9100\b', text, re.I):  certs.add("AS9100")
                    if re.search(r'\bAWS\s*Certified\b', text, re.I): certs.add("AWS Certified")
                    if certs: parsed["certifications_held"] = list(certs)

        except Exception as e:
            log.debug("Failed to scrape %s: %s", url, e)
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

    # Tier B: OpenRouter LLM Extraction (Aggregated per vendor)
    if use_llm_fallback and openrouter_api_key:
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
        SESSION_CREDIT_LIMIT = float(os.getenv("SESSION_CREDIT_LIMIT_USD", "7.0"))
        PER_COMPANY_LIMIT = float(os.getenv("PER_COMPANY_SPEND_LIMIT_USD", "0.50"))
        session_spend = 0.0
        company_spend: dict[str, float] = {}  # per-vendor spend tracking this session
        credit_ceiling_lock = asyncio.Lock()

        async def _check_and_charge(prompt_tokens: int, completion_tokens: int, company_name: str) -> None:
            """Thread-safe credit tracker. Raises CreditExhaustedError on:
            - Session ceiling breach (stops entire enrichment phase)
            - Per-company limit breach (quarantines that vendor, session continues)
            """
            nonlocal session_spend
            cost = (prompt_tokens / 1_000_000 * 3.0) + (completion_tokens / 1_000_000 * 15.0)
            async with credit_ceiling_lock:
                session_spend += cost
                company_spend[company_name] = company_spend.get(company_name, 0.0) + cost

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

                # Skip if primary LLM output already exists
                if v.ai_synopsis and v.ai_metadata_data:
                    log.debug("Skipping LLM for %s — ai_synopsis already populated", v.company_name)
                    return

                # Aggregate markdown for this vendor
                vendor_md = ""
                for u in _candidates(v):
                    if md_map.get(u):
                        vendor_md += f"\n\n# Page: {u}\n" + md_map[u]

                if not vendor_md:
                    return

                # Truncate to 12,000 chars (~3,000 tokens) — sufficient for full profile extraction.
                # Haiku triage removed: enterprise_tier pre-filter does equivalent work at zero cost.
                llm_text = vendor_md[:12000]

                headers = {
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://avlpoint.com",
                    "X-Title": "AVL Point"
                }

                # Increment attempt counter BEFORE calling LLM so a crash still counts.
                await db.increment_enrichment_attempts(v.company_name)

                # --- Direct Sonnet Extraction (no Haiku pre-filter) ---
                system_prompt = """You are a vendor intelligence analyst building structured supplier profiles for an enterprise Approved Vendor List (AVL) platform.

Your goal is to increase the amount of high-value, verified intelligence per company without gathering fluff or generating speculative content. DO NOT GUESS. If a field cannot be confirmed from the text, omit it entirely.

Return ONLY valid JSON matching this exact schema:
{
  "ai_synopsis": "A professional 50-80 word paragraph stating exactly what this company actually does, their primary value proposition, and publicly verifiable signals of scale and credibility.",
  "core_capabilities": ["Specific capability 1", "Specific capability 2"],
  "products": ["Specific product, component, or manufactured item 1", "Specific product 2"],
  "certifications": ["ISO 9001:2015", "AS9100D", "etc."],
  "industries_served": ["Aerospace", "Defense", "etc."],
  "materials_handled": ["316 Stainless Steel", "Inconel 625", "etc."],
  "equipment_list": ["CNC 5-axis mill", "Trumpf laser cutter", "etc."],
  "notable_customers": ["Boeing", "Lockheed Martin", "etc."],
  "partnerships_and_dealers": ["OEM partner name", "Distributor name", "etc."],
  "avl_approvals": ["Approved supplier for Boeing", "Raytheon QPL listed", "NADCAP accredited", "etc."],
  "use_cases": ["Precision machining of turbine blades", "Custom pressure vessel fabrication", "etc."],
  "project_types": ["Types of jobs performed 1", "MRO services", "etc."],
  "technical_specialties": ["Tight tolerance machining \u00b10.0005", "Orbital welding", "etc."],
  "vendor_categories": ["Contract Manufacturer", "Precision Machine Shop", "etc."],
  "inspection_and_qa_capabilities": ["AWS-CWI", "ASNT NDT Level II/III", "In-house RT/UT", "etc."],
  "employee_count": "Number or range if stated",
  "year_established": "Year if stated",
  "facility_size_sqft": "Square footage of facilities if public"
}

RULES:
- For notable_customers: Include ANY verified named companies, clients, OEMs, or end-users mentioned.
- For avl_approvals: Extract any evidence of formal supplier approval, qualified product listings, OEM certifications.
- For products: Be specific about what they manufacture, fabricate, or supply. Not vague categories.
- For core_capabilities: Extract exact processes and manufacturing capabilities.
- For inspection_and_qa_capabilities: Prioritize CWI, NDT, NACE inspectors, and in-house testing methods.
- For certifications: Aggressively seek ASME, API, NBIC, ISO, PED, NQA-1, and AWS standards.
- Connect all data into a cohesive, decision-grade profile."""

                model_name = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
                payload = {
                    "model": model_name,
                    "max_tokens": 1500,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": llm_text}
                    ],
                    "response_format": {"type": "json_object"}
                }

                try:
                    llm_data = await http.post_json(
                        "https://openrouter.ai/api/v1/chat/completions",
                        payload=payload, headers=headers
                    )
                    if llm_data and "choices" in llm_data and llm_data["choices"]:
                        content = llm_data["choices"][0]["message"]["content"]
                        if content.startswith("```"):
                            content = "\n".join(content.split("\n")[1:-1])
                        llm_parsed = json.loads(content)

                        usage = llm_data.get("usage", {})
                        prompt_tokens = usage.get("prompt_tokens", 0)
                        completion_tokens = usage.get("completion_tokens", 0)
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
                    if attempts >= 3:
                        log.warning(
                            "QUARANTINE: %s failed %d times. Setting lifecycle_stage=quarantined.",
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
