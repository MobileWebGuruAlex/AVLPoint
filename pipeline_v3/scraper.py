"""Pipeline v3 scraper — local Playwright, zero API cost.

Per vendor: load the homepage, discover up to MAX_PAGES relevant subpages
(about / capabilities / services / certifications / contact ...), extract
visible text, cache to disk keyed by vendor_id with a content hash.
Polite: one request at a time per domain, small delay, honest UA.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sys

# Windows consoles default to cp1252 — CJK vendor names would crash print()
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright

import state

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# US first, verified tier ascending, suitability score, then a stable
# tie-breaker. Shared with enrich.py's submit() so scrape order and
# submit order agree on what "next" means.
PRIORITY_ORDER = (
    "CASE WHEN v.country LIKE '%United States%' OR upper(v.country) IN ('US','USA') "
    "THEN 0 ELSE 1 END, "
    "v.enterprise_tier ASC, v.enterprise_suitability_score DESC, s.vendor_id"
)

MAX_PAGES = 6
MAX_TEXT_CHARS = 48_000  # ~12K tokens ceiling into the model
PAGE_TIMEOUT_MS = 25_000
CONCURRENCY = 6
PER_DOMAIN_DELAY_S = 2.0
UA = "AVLpointBot/1.0 (+https://avlpoint.com; vendor directory profile builder)"

RELEVANT = re.compile(
    r"about|capab|service|product|certif|qualit|equip|facilit|industr|contact|company|history|team",
    re.I,
)
SKIP = re.compile(r"\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp|css|js)(\?|$)|mailto:|tel:|#", re.I)


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def scrape_vendor(context, sem, domain_locks, vendor) -> dict | None:
    vid, url = vendor["id"], vendor["website_url"]
    if not url.startswith("http"):
        url = "https://" + url
    domain = urlparse(url).netloc
    lock = domain_locks.setdefault(domain, asyncio.Lock())

    pages_out, seen = [], set()
    images: list[dict] = []

    async with sem:
        page = await context.new_page()
        try:
            queue = [url]
            while queue and len(pages_out) < MAX_PAGES:
                target = queue.pop(0)
                if target in seen:
                    continue
                seen.add(target)
                async with lock:
                    try:
                        await page.goto(target, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
                        await page.wait_for_timeout(600)
                        text = _clean(await page.inner_text("body"))
                        title = await page.title()
                    except Exception as e:
                        if not pages_out:  # homepage itself failed
                            raise
                        continue
                    finally:
                        await asyncio.sleep(PER_DOMAIN_DELAY_S)
                if len(text) < 100:
                    continue
                pages_out.append({"url": target, "title": title, "text": text[:MAX_TEXT_CHARS // 2]})

                if len(pages_out) == 1:  # homepage only: images + subpage discovery
                    # logo + up to a handful of real photos (cards/profile show max 5)
                    try:
                        images = await page.evaluate(
                            """() => {
                              const out = [];
                              const push = (u, k) => { if (u && /^https?:/.test(u)) out.push({u, k}); };
                              const og = document.querySelector('meta[property="og:image"]');
                              if (og) push(og.content, 'photo');
                              for (const sel of ['link[rel="apple-touch-icon"]',
                                                 'link[rel="icon"]', 'link[rel="shortcut icon"]']) {
                                const l = document.querySelector(sel);
                                if (l && l.href) { push(l.href, 'logo'); break; }
                              }
                              [...document.images]
                                .filter(i => i.naturalWidth >= 250 && i.naturalHeight >= 150)
                                .sort((a, b) => b.naturalWidth * b.naturalHeight
                                              - a.naturalWidth * a.naturalHeight)
                                .slice(0, 8)
                                .forEach(i => push(i.currentSrc || i.src,
                                  /logo/i.test((i.src || '') + (i.alt || '') + (i.className || ''))
                                    ? 'logo' : 'photo'));
                              return out;
                            }"""
                        ) or []
                    except Exception:
                        images = []
                    hrefs = await page.eval_on_selector_all(
                        "a[href]", "els => els.map(e => e.getAttribute('href'))"
                    )
                    for h in hrefs or []:
                        if not h or SKIP.search(h):
                            continue
                        absu = urljoin(target, h)
                        if urlparse(absu).netloc != domain:
                            continue
                        if RELEVANT.search(absu) and absu not in seen:
                            queue.append(absu)
        finally:
            await page.close()

    total = "\n\n---PAGE---\n\n".join(
        f"[{p['title']}] {p['url']}\n{p['text']}" for p in pages_out
    )[:MAX_TEXT_CHARS]
    if len(total) < 200:
        return None
    # dedupe images by URL, keep at most 1 logo + 4 photos (5 total, hard cap)
    seen_u, logo, photos = set(), None, []
    for im in images:
        u = im.get("u", "")
        if not u or u in seen_u:
            continue
        seen_u.add(u)
        if im.get("k") == "logo" and logo is None:
            logo = u
        elif im.get("k") == "photo" and len(photos) < 4:
            photos.append(u)

    return {
        "vendor_id": vid,
        "pages": len(pages_out),
        "content_hash": hashlib.sha256(total.encode()).hexdigest()[:16],
        "text": total,
        "logo": logo,
        "photos": photos,
    }


CHUNK = 6  # fresh browser per chunk — one crashed site can't take down the run


async def run(limit: int) -> None:
    con = state.connect()
    # Priority: United States first, then verified tier ascending (tier 1 =
    # actually owner-claimed/inspector-verified, not an automated score),
    # then suitability score. Plain vendor_id order previously let whichever
    # rows happened to queue first jump the line regardless of tier/region.
    vendors = con.execute(
        f"""SELECT v.id, v.website_url, v.company_name FROM enrich_v3_state s
           JOIN vendors v ON v.id = s.vendor_id
           WHERE s.stage = 'queued'
           ORDER BY {PRIORITY_ORDER} LIMIT ?""",
        [limit],
    ).fetchall()
    if not vendors:
        print("nothing queued")
        return

    ok = fail = 0

    async with async_playwright() as pw:
        for i in range(0, len(vendors), CHUNK):
            chunk = vendors[i:i + CHUNK]
            try:
                browser = await pw.chromium.launch(args=["--disable-gpu"])
                context = await browser.new_context(
                    user_agent=UA, viewport={"width": 1366, "height": 900}
                )
            except Exception as e:
                print(f"  browser launch failed: {e}")
                break

            sem = asyncio.Semaphore(CONCURRENCY)
            domain_locks: dict[str, asyncio.Lock] = {}

            async def one(v):
                nonlocal ok, fail
                try:
                    result = await scrape_vendor(context, sem, domain_locks, v)
                    if result:
                        (CACHE_DIR / f"{v['id']}.json").write_text(
                            json.dumps(result), encoding="utf-8"
                        )
                        state.set_stage(con, v["id"], "scraped",
                                        content_hash=result["content_hash"],
                                        pages_scraped=result["pages"], error=None)
                        ok += 1
                        print(f"  scraped #{v['id']} {v['company_name'][:40]} ({result['pages']}p)")
                    else:
                        state.set_stage(con, v["id"], "failed", error="no usable text")
                        fail += 1
                except Exception as e:
                    state.set_stage(con, v["id"], "failed", error=str(e)[:300])
                    fail += 1
                    print(f"  FAILED #{v['id']} {v['company_name'][:40]}: {str(e)[:80]}")

            await asyncio.gather(*(one(v) for v in chunk))
            try:
                await browser.close()
            except Exception:
                pass

    print(f"\nscrape done: {ok} ok, {fail} failed")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    asyncio.run(run(n))
