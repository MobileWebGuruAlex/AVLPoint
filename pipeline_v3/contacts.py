"""Pipeline v3 contact recovery — targeted, delta-only, zero-waste.

Fills ONLY missing contact_email / contact_phone / street_address. Never
touches a vendor that already has the field. Never overwrites.

Tier 0 (free)  : targeted page fetch — /contact, /contact-us, /about + homepage
                 via local Playwright (Firecrawl credits are exhausted; this is
                 the same data for $0).
Tier A (free)  : aggressive local parsing, reusing sources/parsers.py
                 (tel:/mailto:/JSON-LD/obfuscated "sales at co dot com"/footer).
Tier B (cheap) : ONLY if Tier A found nothing — google/gemini-2.5-flash via
                 OpenRouter, asked for the missing fields only.

Every value is grounding-checked against the fetched text before it is written:
if the model returns something not literally on the page, it is discarded.

Usage: python contacts.py [limit]
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import state
from sources import parsers

CONTACT_PATHS = ["/contact", "/contact-us", "/contactus", "/about", "/about-us", "/contact.html"]
CONCURRENCY = 5
PAGE_TIMEOUT_MS = 20_000
UA = "AVLpointBot/1.0 (+https://avlpoint.com; vendor directory contact lookup)"

GEMINI_MODEL = "google/gemini-2.5-flash"
EMAIL_OK = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")
JUNK_EMAIL = re.compile(r"@(example|domain|yoursite|email|sentry|wixpress)\.|^(info|email)@(site|domain)", re.I)


def _env(name: str) -> str:
    v = os.getenv(name, "")
    if v:
        return v
    envf = Path(__file__).resolve().parent.parent / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    return ""


# ---------------------------------------------------------------- Tier 0: fetch

async def fetch_contact_pages(context, base_url: str) -> str:
    """Homepage + the contact-ish paths that actually exist. Returns raw HTML
    concatenated (HTML, not text — tel:/mailto:/JSON-LD live in the markup)."""
    if not base_url.startswith("http"):
        base_url = "https://" + base_url
    root = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
    blobs: list[str] = []
    page = await context.new_page()
    try:
        for target in [base_url] + [urljoin(root, p) for p in CONTACT_PATHS]:
            if len(blobs) >= 3:  # homepage + 2 good contact pages is plenty
                break
            try:
                resp = await page.goto(target, timeout=PAGE_TIMEOUT_MS,
                                       wait_until="domcontentloaded")
                if not resp or resp.status >= 400:
                    continue
                await page.wait_for_timeout(400)
                blobs.append(await page.content())
            except Exception:
                continue
    finally:
        await page.close()
    return "\n\n".join(blobs)


# --------------------------------------------------- Tier A: local parsing (free)

def tier_a(blob: str) -> dict:
    """Reuse the project's existing parsers — they already cover tel:, mailto:,
    JSON-LD, obfuscated emails, and footer patterns."""
    out: dict[str, str] = {}
    try:
        parsed = parsers.parse_profile_markdown(blob) or {}
        for k in ("contact_email", "contact_phone", "street_address", "city",
                  "state_province", "zip_postal_code"):
            if parsed.get(k):
                out[k] = str(parsed[k]).strip()
    except Exception:
        pass
    if not out.get("contact_email"):
        em = parsers.find_email(blob)
        if em:
            out["contact_email"] = em.strip()
    if not out.get("contact_phone"):
        ph = parsers.find_phone(blob)
        if ph:
            out["contact_phone"] = ph.strip()
    return out


# ------------------------------------------- Tier B: Gemini Flash via OpenRouter

TIER_B_PROMPT = """Extract ONLY the requested contact fields for this company from the page text.
Rules: copy values CHARACTER-FOR-CHARACTER from the text. If a field is not present, use "".
Never guess, never construct, never use a generic placeholder.
Return strict JSON with exactly these keys: {keys}.

Company: {name}
Page text:
{text}"""


def tier_b(name: str, text: str, missing: list[str]) -> dict:
    key = _env("OPENROUTER_API_KEY")
    if not key or not missing:
        return {}
    # Zero-waste gate: don't pay for an extraction the page cannot satisfy.
    # No "@" anywhere -> no email to find. No 7+ digit run -> no phone.
    if missing == ["contact_email"] and "@" not in text:
        return {}
    if missing == ["contact_phone"] and not re.search(r"\d[\d\D]{0,3}(\d[\d\D]{0,3}){6}", text):
        return {}
    try:
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "HTTP-Referer": "https://avlpoint.com",
                     "X-Title": "AVLpoint pipeline v3"},
            json={
                "model": GEMINI_MODEL,
                "max_tokens": 300,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": TIER_B_PROMPT.format(
                    keys=", ".join(missing), name=name,
                    text=parsers.text_only(text)[:12000])}],
            },
            timeout=60,
        )
        if r.status_code != 200:
            return {}
        content = r.json()["choices"][0]["message"]["content"]
        content = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.M).strip()
        data = json.loads(content)
        return {k: str(v).strip() for k, v in data.items() if k in missing and str(v).strip()}
    except Exception:
        return {}


# ------------------------------------------------------------------ validation

def grounded(value: str, blob: str, field: str) -> bool:
    """The value must literally exist on the page. Phones compared digits-only."""
    v = (value or "").strip()
    if not v:
        return False
    if field == "contact_email":
        if not EMAIL_OK.match(v) or JUNK_EMAIL.search(v):
            return False
        return v.lower() in blob.lower()
    if field == "contact_phone":
        digits = re.sub(r"\D", "", v)
        # E.164: 10-15 digits. Anything longer is concatenated garbage
        # (e.g. "3245578475922" glued from two numbers on the page).
        if not 10 <= len(digits) <= 15:
            return False
        # The FULL digit run must appear contiguously in the page's digit
        # stream — matching only the last 10 lets random sequences through.
        return digits in re.sub(r"\D", "", blob)
    return v.lower() in blob.lower()


# ------------------------------------------------------------------------ main

FIELDS = ("contact_email", "contact_phone", "street_address")


async def run(limit: int) -> None:
    con = state.connect()
    # DELTA ONLY: a vendor is a candidate only if something is actually missing.
    rows = con.execute(
        """SELECT id, company_name, website_url, contact_email, contact_phone,
                  street_address, city, state_province
           FROM vendors
           WHERE website_url IS NOT NULL AND website_url != ''
             AND completeness_status = 'verified'
             AND (contact_email IS NULL OR contact_email = ''
               OR contact_phone IS NULL OR contact_phone = '')
             AND NOT EXISTS (SELECT 1 FROM vendor_states vs
                             WHERE vs.vendor_id = vendors.id AND vs.state = 'sleeping')
           ORDER BY enterprise_tier ASC, enterprise_suitability_score DESC
           LIMIT ?""",
        [limit],
    ).fetchall()
    if not rows:
        print("no vendors need contact recovery")
        return

    print(f"contact recovery: {len(rows)} candidates (delta-only)")
    sem = asyncio.Semaphore(CONCURRENCY)
    stats = {"a": 0, "b": 0, "none": 0, "fields": 0, "b_calls": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--disable-gpu"])
        context = await browser.new_context(user_agent=UA,
                                            viewport={"width": 1366, "height": 900})

        async def one(v):
            async with sem:
                missing = [f for f in FIELDS if not (v[f] or "").strip()]
                # only chase email/phone; address is opportunistic
                if not any(m in ("contact_email", "contact_phone") for m in missing):
                    return
                try:
                    blob = await fetch_contact_pages(context, v["website_url"])
                except Exception:
                    blob = ""
                if len(blob) < 200:
                    stats["none"] += 1
                    return

                found = {k: val for k, val in tier_a(blob).items() if k in missing}
                found = {k: val for k, val in found.items() if grounded(val, blob, k)}
                if found:
                    stats["a"] += 1

                still = [m for m in missing if m not in found
                         and m in ("contact_email", "contact_phone")]
                if still:
                    stats["b_calls"] += 1
                    b = tier_b(v["company_name"], blob, still)
                    b = {k: val for k, val in b.items() if grounded(val, blob, k)}
                    if b:
                        stats["b"] += 1
                        found.update(b)

                if not found:
                    stats["none"] += 1
                    return

                # ADD-ONLY write: COALESCE keeps any existing value untouched
                sets, vals = [], []
                for k, val in found.items():
                    sets.append(f"{k} = COALESCE(NULLIF({k}, ''), ?)")
                    vals.append(val)
                vals.append(v["id"])
                con.execute(f"UPDATE vendors SET {', '.join(sets)}, "
                            f"last_updated = datetime('now') WHERE id = ?", vals)
                con.commit()
                stats["fields"] += len(found)
                print(f"  #{v['id']} {v['company_name'][:36]} -> "
                      + ", ".join(f"{k}={val[:32]}" for k, val in found.items()))

        await asyncio.gather(*(one(v) for v in rows))
        await browser.close()

    print(f"\ncontacts done: {stats['fields']} fields filled | "
          f"tier-A hits {stats['a']}, tier-B hits {stats['b']} "
          f"({stats['b_calls']} gemini calls), nothing found {stats['none']}")


if __name__ == "__main__":
    asyncio.run(run(int(sys.argv[1]) if len(sys.argv) > 1 else 25))
