"""Thomasnet supplier-directory scraper.

Strategy:
  1) Hit Thomasnet category ("heading") listing pages directly. Pages are
     paginated as ?pg=N (~24 suppliers per page).
  2) Each listing card carries supplier name + profile URL + city — most of
     what we need without ever opening the profile.
  3) Cloudflare blocks naïve aiohttp on thomasnet.com, so the listing fetch
     is routed through Local Scraper /scrape in markdown-only mode (cheap, fast)
     when an aiohttp 403 occurs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import AsyncIterator, Optional
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from db_async import AsyncDB, VendorRecord
from http_client import ConcurrentClient
from sources.parsers import parse_profile_markdown

log = logging.getLogger("thomasnet")

CURSOR_FILE = "cursor_state.json"

def _load_cursor():
    if os.path.exists(CURSOR_FILE):
        try:
            with open(CURSOR_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_cursor(data):
    try:
        with open(CURSOR_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

BASE = "https://www.thomasnet.com"

# High-value industrial fabrication / pressure-equipment headings.
# Each heading is a category page with hundreds of suppliers across pages.
# (Heading IDs are stable Thomasnet identifiers.)
HEADINGS: list[tuple[str, str]] = [
    ("asme-code-pressure-vessels", "91721100"),
    ("pressure-vessels", "82220300"),
    ("steel-fabricators", "73210405"),
    ("custom-metal-fabricators", "20020207"),
    ("heat-exchangers", "76210405"),
    ("storage-tanks", "97002603"),
    ("stainless-steel-tanks", "97002800"),
    ("titanium-fabrication", "20021601"),
    ("frp-tanks", "97002902"),
    ("welding-services-custom", "95871501"),
    ("reactor-vessels", "82220505"),
    ("columns-towers", "82223000"),
]

# Thomasnet state-level pages render ~25 supplier profile URLs publicly
# (the rest is gated by registration). The USA-wide pages are fully gated.
STATES = [
    "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
    "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
    "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
    "minnesota","mississippi","missouri","montana","nebraska","nevada",
    "new-hampshire","new-jersey","new-mexico","new-york","north-carolina",
    "north-dakota","ohio","oklahoma","oregon","pennsylvania","rhode-island",
    "south-carolina","south-dakota","tennessee","texas","utah","vermont",
    "virginia","washington","west-virginia","wisconsin","wyoming",
]

PROFILE_HREF_RE = re.compile(r"/company/[a-z0-9-]+-\d+/profile")
COMPANY_SLUG_RE = re.compile(r"/company/([a-z0-9-]+)-(\d+)/profile")


def _heading_url(slug: str, hid: str, page: int = 1) -> str:
    if page == 1:
        return f"{BASE}/suppliers/usa/{slug}-{hid}"
    return f"{BASE}/suppliers/usa/{slug}-{hid}?pg={page}"


def _state_heading_url(state: str, slug: str, hid: str, page: int = 1) -> str:
    base = f"{BASE}/suppliers/{state}/all-cities/{slug}-{hid}"
    return base if page == 1 else f"{base}?pg={page}"


def _name_from_slug(slug: str) -> str:
    """Turn 'kennedy-tank-and-manufacturing-co-inc' into 'Kennedy Tank and Manufacturing Co Inc'."""
    words = slug.split("-")
    smallcaps = {"and", "of", "the", "for", "to", "in"}
    out = []
    for i, w in enumerate(words):
        if not w:
            continue
        if i > 0 and w in smallcaps:
            out.append(w)
        elif w.upper() in {"USA", "LLC", "INC", "LP", "LLP", "CO", "LTD", "PLC"}:
            out.append(w.upper())
        else:
            out.append(w.capitalize())
    return " ".join(out)


def _parse_listing_html(html: str) -> list[dict]:
    out = []
    tree = HTMLParser(html)
    for card in tree.css("[data-supplier-id], article.supplier, li.supplier, div.profile-card"):
        name_node = card.css_first("h2, h3, .profile-card__title, .supplier-name, a[href*='/profile/']")
        link_node = card.css_first("a[href*='/profile/'], a[href*='/company/']")
        loc_node = card.css_first(".profile-card__location, .supplier-location, address, .location")
        if not name_node:
            continue
        href = link_node.attributes.get("href") if link_node else None
        profile_url = urljoin(BASE, href) if href else None
        if profile_url and not PROFILE_HREF_RE.search(profile_url):
            continue
        out.append({
            "company_name": name_node.text(strip=True),
            "thomasnet_profile_url": profile_url,
            "headquarters_location": loc_node.text(strip=True) if loc_node else None,
        })
    if not out:
        # Fallback: extract every profile link on the page
        seen = set()
        for a in tree.css("a[href*='/profile/'], a[href*='/company/']"):
            href = a.attributes.get("href")
            if not href:
                continue
            url = urljoin(BASE, href)
            if url in seen:
                continue
            seen.add(url)
            name = a.text(strip=True)
            if not name or len(name) < 3:
                continue
            out.append({
                "company_name": name,
                "thomasnet_profile_url": url,
                "headquarters_location": None,
            })
    return out


def _parse_listing_markdown(md: str) -> list[dict]:
    """Parse Local Scraper markdown for a Thomasnet listing page.

    Thomasnet renders supplier cards with 'View Profile' link text — the
    company name comes from the URL slug, not the anchor. Locations come
    from text near each link.
    """
    out: dict[str, dict] = {}
    # Match every /company/<slug>-<id>/profile URL in the markdown
    for m in COMPANY_SLUG_RE.finditer(md):
        slug, cid = m.group(1), m.group(2)
        url = f"{BASE}/company/{slug}-{cid}/profile"
        if cid in out:
            continue
        # Look for a heading-style "## Name" or bolded name in the 600 chars before the link
        start = max(0, m.start() - 800)
        before = md[start:m.start()]
        name = None
        # Prefer the most recent ## ... line above
        headings = re.findall(r"\n#{1,4}\s+([A-Z][^\n]{3,120})", before)
        if headings:
            cand = headings[-1].strip()
            # Skip generic section headings
            if cand.lower() not in {"verified suppliers", "company type", "industry",
                                     "quality certifications", "compliance & registrations",
                                     "material", "all filters"}:
                name = cand
        # Else try bolded **Name**
        if not name:
            bolds = re.findall(r"\*\*([A-Z][^*\n]{3,120})\*\*", before)
            if bolds:
                name = bolds[-1].strip()
        if not name:
            name = _name_from_slug(slug)
        # Extract a probable location from the 400 chars after the link
        after = md[m.end():m.end() + 400]
        loc_m = re.search(r"([A-Za-z][A-Za-z\. ]{2,30}),\s*([A-Z]{2})\b", after)
        location = f"{loc_m.group(1).strip()}, {loc_m.group(2)}" if loc_m else None
        out[cid] = {
            "company_name": name.strip(),
            "thomasnet_profile_url": url,
            "headquarters_location": location,
        }
    return list(out.values())


class ThomasnetSource:
    name = "Thomasnet"

    def __init__(self, http: ConcurrentClient, html_scrape, db: AsyncDB, max_pages_per_heading: int = 15):
        self.http = http
        self.html_scrape = html_scrape  # async callable -> markdown
        self.db = db
        self.max_pages_per_heading = max_pages_per_heading

    async def _fetch_listing(self, url: str) -> Optional[list[dict]]:
        # Try raw first (cheaper); fall back to Local Scraper on Cloudflare block.
        html = await self.http.get(url)
        if html and "<html" in html.lower() and "cloudflare" not in html.lower()[:5000]:
            records = _parse_listing_html(html)
            if records:
                return records
        md = await self.html_scrape(url)
        if md:
            return _parse_listing_markdown(md)
        return None


    async def discover(self) -> AsyncIterator[VendorRecord]:
        """Yield vendor records from state-scoped category listings.

        Uses cursor_state.json to resume exactly where it left off.
        """
        sem = asyncio.Semaphore(15)
        cursor_data = _load_cursor()
        thomas_cursor = cursor_data.get("thomasnet", {})

        async def crawl_state_heading(state: str, slug: str, hid: str):
            key = f"{slug}:{state}"
            page = thomas_cursor.get(key, 1)
            results = []
            
            # Scrape up to 5 pages per state/heading per pipeline run
            # to maintain throughput without stalling on deep categories.
            for _ in range(5):
                url = _state_heading_url(state, slug, hid, page)
                if self.db.is_seen(url):
                    page += 1
                    continue
                async with sem:
                    records = await self._fetch_listing(url)
                if not records:
                    break
                await self.db.mark_seen(url, "thomasnet")
                for r in records:
                    results.append((state, slug, page, r))
                page += 1
                thomas_cursor[key] = page
                cursor_data["thomasnet"] = thomas_cursor
                _save_cursor(cursor_data)
            return results

        state_subset = STATES[: max(1, self.max_pages_per_heading)] if self.max_pages_per_heading < len(STATES) else STATES
        tasks = []
        for slug, hid in HEADINGS:
            for state in state_subset:
                tasks.append(asyncio.create_task(crawl_state_heading(state, slug, hid)))

        completed = 0
        for t in asyncio.as_completed(tasks):
            completed += 1
            for state, slug, page, r in (await t):
                if await self.db.is_seen_company(r["company_name"]):
                    continue
                yield VendorRecord(
                    company_name=r["company_name"],
                    headquarters_location=r.get("headquarters_location"),
                    certifications_held=[],
                    materials_handled=[],
                    key_personnel=[],
                    thomasnet_profile_url=r.get("thomasnet_profile_url"),
                    data_source=f"Thomasnet:{slug}:{state}:pg{page}",
                )
            if completed % 25 == 0:
                log.info("Thomasnet discovery progress: %d/%d state-headings", completed, len(tasks))

    async def enrich_profile(self, vendor: VendorRecord) -> VendorRecord:
        """Optional: pull a profile page and parse fields cheaply."""
        if not vendor.thomasnet_profile_url:
            return vendor
        md = await self.html_scrape(vendor.thomasnet_profile_url)
        if not md:
            return vendor
        parsed = parse_profile_markdown(md)
        if not vendor.contact_email:
            vendor.contact_email = parsed.get("contact_email")
        if not vendor.contact_phone:
            vendor.contact_phone = parsed.get("contact_phone")
        if not vendor.facility_size_sqft:
            vendor.facility_size_sqft = parsed.get("facility_size_sqft")
        if not vendor.year_established:
            vendor.year_established = parsed.get("year_established")
        certs = set(vendor.certifications_held or [])
        certs.update(parsed.get("certifications_held") or [])
        vendor.certifications_held = sorted(certs)
        mats = set(vendor.materials_handled or [])
        mats.update(parsed.get("materials_handled") or [])
        vendor.materials_handled = sorted(mats)
        if not vendor.primary_business_type:
            vendor.primary_business_type = parsed.get("primary_business_type")
        # website_url heuristic: find first non-thomasnet external link
        ext_match = re.search(r"https?://(?!www\.thomasnet)([\w.-]+\.[a-z]{2,6})/?", md)
        if ext_match and not vendor.website_url:
            vendor.website_url = "https://" + ext_match.group(1)
        return vendor
