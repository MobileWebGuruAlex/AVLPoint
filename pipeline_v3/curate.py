"""Curation v2 — LLM-judged sweep of every awake vendor. Junk goes to sleep.

The v1 curation (docs/curation-sleep.mjs) was SQL-heuristic only, so article
titles, forum questions, ticket pages, and directory listings that look
name-shaped survived. This pass judges EVERY awake vendor by company_name +
website_url:

  1. heuristic pre-pass (free): slam-dunk junk domains/paths/name shapes
  2. Gemini flash-lite, 50 records per call (~$1 for the whole database)

Junk is PUT TO SLEEP via vendor_states — never deleted, one click to wake
from /admin/vendors/sleeping. Every action lands in curation_v2_ledger.csv.
Queued pipeline work for slept vendors is marked triaged_out so no budget
is ever spent on them.

Usage:  python curate.py --dry     # counts + samples only
        python curate.py           # real run
"""
from __future__ import annotations

import csv
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import gemini
import state

LEDGER = Path(__file__).resolve().parent / "curation_v2_ledger.csv"
REASON = "Automated curation v2 (LLM): not a company / not vendor-related (reversible)"
ACTOR = "system:curation-v2"
BATCH = 50
THREADS = 8

# ---------------------------------------------------------------- heuristics
#
# Bulletproof-only. Lesson from the dry run: substring URL regexes are a trap —
# `x\.com` matched metalworx.com/sfmex.com, and srsltid= is just a Google
# referral param on real homepages. Hosts are matched EXACTLY (or by proper
# subdomain suffix); everything ambiguous goes to the LLM instead.

from urllib.parse import urlparse

JUNK_HOSTS = {
    "zhihu.com", "quora.com", "reddit.com", "ticketmaster.com", "stubhub.com",
    "wikipedia.org", "wikihow.com", "youtube.com", "youtu.be", "facebook.com",
    "instagram.com", "twitter.com", "x.com", "tiktok.com", "pinterest.com",
    "medium.com", "blogspot.com", "wordpress.com", "tumblr.com",
    "glassdoor.com", "indeed.com", "ziprecruiter.com", "monster.com",
    "tripadvisor.com", "yelp.com", "mapquest.com", "yellowpages.com",
    "yellowpages.ca", "whitepages.com", "manta.com", "ibegin.com",
    "iccwbo.org", "investopedia.com", "britannica.com", "lowyat.net",
    "dictionary.com", "thesaurus.com", "amazon.com", "ebay.com",
}

JUNK_NAMES = re.compile(
    r"(^(understanding|what is|what are|how to|why do|why is|top \d+|upcoming"
    r"|guide to|learn about|list of)\b"
    r"|\?\s*$"
    r"|letters? of credit"
    r"|\b(sports?|concert|event) tickets\b"
    r"|companies starting with"
    r"|[？])",
    re.I,
)

GENERIC_ALONE = {
    "about", "about us", "contact", "contact us", "home", "homepage",
    "welcome", "index", "blog", "news", "search", "login", "sign in",
    "register", "not found", "404", "privacy policy", "terms", "sitemap",
}


def _host(url: str) -> str:
    try:
        h = urlparse(url if "://" in url else "https://" + url).netloc.lower().split(":")[0]
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


def heuristic_junk(name: str, url: str) -> bool:
    n = (name or "").strip()
    if n.lower().strip(" .|-–") in GENERIC_ALONE:
        return True
    h = _host(url or "")
    if h and any(h == d or h.endswith("." + d) for d in JUNK_HOSTS):
        return True
    if JUNK_NAMES.search(n):
        return True
    return False


# ---------------------------------------------------------------- LLM triage

PROMPT = """You are cleaning an industrial vendor directory (welding, fabrication, machining,
manufacturing, industrial services). For each numbered record below decide:

COMPANY - plausibly a real, specific company/business (even with a messy scraped
          title like "About | Woodhouse Labs" or "Acme Steel - Home", or a
          non-industrial business; keep those)
JUNK    - clearly NOT a specific company: articles, guides, questions, forum/Q&A
          posts, news, event/ticket pages, directory/category/listing pages,
          government portals, product-explainer pages ("Letters of Credit"),
          educational content, "companies starting with X" indexes, dead pages

When genuinely unsure, answer COMPANY (sleeping a real vendor is worse than
keeping a stray page one more cycle).

Return STRICT JSON: {{"v": [{{"i": <number>, "j": true|false}}, ...]}} where j=true means JUNK.
Include every record exactly once.

Records:
{records}"""


def llm_batch(rows: list) -> dict[int, bool]:
    recs = "\n".join(
        f"{i}. name: {r['company_name'][:90]} | url: {(r['website_url'] or '-')[:100]}"
        for i, r in enumerate(rows)
    )
    data = gemini.generate_json(PROMPT.format(records=recs),
                                model=gemini.FLASH_LITE, max_tokens=4000)
    out: dict[int, bool] = {}
    if isinstance(data, dict):
        for item in data.get("v", []):
            try:
                out[int(item["i"])] = bool(item["j"])
            except Exception:
                continue
    return out


# ---------------------------------------------------------------------- main

def run(dry: bool) -> None:
    con = state.connect()
    rows = con.execute(
        """SELECT v.id, v.company_name, v.website_url FROM vendors v
           WHERE NOT EXISTS (SELECT 1 FROM vendor_states vs
                             WHERE vs.vendor_id = v.id AND vs.state = 'sleeping')
           ORDER BY v.id"""
    ).fetchall()
    print(f"awake vendors to judge: {len(rows)}")

    heur = [r for r in rows if heuristic_junk(r["company_name"], r["website_url"] or "")]
    rest = [r for r in rows if not heuristic_junk(r["company_name"], r["website_url"] or "")]
    print(f"heuristic junk (free): {len(heur)}")
    print(f"going to Gemini flash-lite: {len(rest)} in {len(rest)//BATCH + 1} batches")

    if dry:
        for r in heur[:12]:
            print(f"  [heur] #{r['id']} {r['company_name'][:70]}")
        sample = rest[:BATCH]
        verdicts = llm_batch(sample)
        for i, r in enumerate(sample):
            if verdicts.get(i):
                print(f"  [llm ] #{r['id']} {r['company_name'][:70]}")
        print("dry run only — nothing written")
        return

    junk: list[tuple] = [(r["id"], r["company_name"], r["website_url"], "heuristic") for r in heur]

    batches = [rest[i:i + BATCH] for i in range(0, len(rest), BATCH)]
    done = 0

    def judge(batch):
        verdicts = llm_batch(batch)
        return [(b["id"], b["company_name"], b["website_url"], "llm")
                for i, b in enumerate(batch) if verdicts.get(i)]

    with ThreadPoolExecutor(THREADS) as ex:
        for result in ex.map(judge, batches):
            junk.extend(result)
            done += 1
            if done % 50 == 0:
                print(f"  ...{done}/{len(batches)} batches, junk so far {len(junk)}")

    print(f"total junk verdicts: {len(junk)}")

    # ledger first, then sleep — reviewable and reversible
    new_file = not LEDGER.exists()
    with LEDGER.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["vendor_id", "company_name", "website_url", "method"])
        w.writerows(junk)

    cur = con.executemany(
        """INSERT OR IGNORE INTO vendor_states (vendor_id, state, reason, changed_by, changed_at)
           VALUES (?, 'sleeping', ?, ?, datetime('now'))""",
        [(vid, REASON, ACTOR) for vid, *_ in junk],
    )
    con.commit()
    print(f"put to sleep: {cur.rowcount}")

    # never spend budget on slept vendors already sitting in the queue
    slept_ids = [vid for vid, *_ in junk]
    q = con.executemany(
        """UPDATE enrich_v3_state SET stage = 'triaged_out', error = 'curation v2'
           WHERE vendor_id = ? AND stage IN ('queued', 'scraped')""",
        [(vid,) for vid in slept_ids],
    )
    con.commit()
    print(f"pulled from pipeline queue: {q.rowcount}")
    print(f"gemini spend today: ${gemini.usage_today().get('est_cost', 0):.2f}")
    print(f"ledger: {LEDGER}")


if __name__ == "__main__":
    run(dry="--dry" in sys.argv)
