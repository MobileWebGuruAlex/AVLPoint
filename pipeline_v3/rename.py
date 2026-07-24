"""Name normalization — turn scraped page titles into real company names.

"12 Hudson Welding | Welding & Fabrication Specialists North Brisbane..."
(hudsonwelding.com.au) should read "Hudson Welding". Judged by Gemini
flash-lite in 50-record batches (~$0.10 for the whole awake set), with a
hard grounding guard: a new name is applied ONLY if it is
  a) a case-insensitive substring of the existing name/title, or
  b) matches the website's domain core (e.g. "Woodhouse Labs" ~ woodhouselabs.com)
so the model can never invent a name out of thin air. Everything else is
skipped and logged. Old names land in rename_ledger.csv (replayable undo).

Usage:  python rename.py --dry     # sample only
        python rename.py           # real run (awake vendors only)
"""
from __future__ import annotations

import csv
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import gemini
import state

LEDGER = Path(__file__).resolve().parent / "rename_ledger.csv"
BATCH = 50
THREADS = 8

PROMPT = """Each record below is from an industrial vendor directory. The "title" field is a
scraped web-page title; the real company name is usually buried inside it, or
implied by the domain. For each record return the clean, official company name.

Rules:
- Strip taglines, locations, service lists, separators: "Acme Steel | Custom
  Fabrication in Texas" -> "Acme Steel"
- Keep legal suffixes if present (Inc, LLC, GmbH, SA de CV, Co., Ltd)
- If the title is generic ("About", "Home") derive the name from the domain:
  woodhouselabs.com -> "Woodhouse Labs"
- If you cannot determine a specific company name, return ""
- NEVER invent a name that is not supported by the title or domain.

Return STRICT JSON: {{"v": [{{"i": <number>, "n": "<clean name or empty>"}}, ...]}}
Include every record exactly once.

Records:
{records}"""


def domain_core(url: str) -> str:
    try:
        h = urlparse(url if "://" in url else "https://" + url).netloc.lower()
        h = h.split(":")[0]
        h = h[4:] if h.startswith("www.") else h
        return re.sub(r"[^a-z0-9]", "", h.split(".")[0])
    except Exception:
        return ""


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def grounded(new: str, old: str, url: str) -> bool:
    """Accept only names traceable to the title or the domain."""
    n = norm(new)
    if not 2 <= len(n) <= 80:
        return False
    # Reject raw domain-glob names ("williamsandwhitemanufacturing"): a long
    # single lowercase token that isn't in the title reads worse than the
    # messy title it would replace.
    if " " not in new.strip() and new == new.lower() and len(new) > 14 \
            and n not in norm(old):
        return False
    if n in norm(old):
        return True
    core = domain_core(url)
    if core and (n in core or core in n):
        return True
    # tokenwise: every word of the new name appears in title or domain
    words = [norm(w) for w in new.split() if len(norm(w)) > 1]
    if words and all(w in norm(old) or (core and w in core) for w in words):
        return True
    return False


def llm_batch(rows: list) -> dict[int, str]:
    recs = "\n".join(
        f"{i}. title: {r['company_name'][:100]} | domain: {domain_core(r['website_url'] or '') or '-'}"
        for i, r in enumerate(rows)
    )
    data = gemini.generate_json(PROMPT.format(records=recs),
                                model=gemini.FLASH_LITE, max_tokens=5000)
    out: dict[int, str] = {}
    if isinstance(data, dict):
        for item in data.get("v", []):
            try:
                out[int(item["i"])] = str(item["n"]).strip()
            except Exception:
                continue
    return out


# Only titles that look like page-title debris are worth an LLM call.
MESSY = re.compile(
    r"(\||–|—| - .* - |:.{10,}|\b(welcome|home page|official site|leading"
    r"|specialists?|solutions|services in|manufacturer of|supplier of|store in"
    r"|is a global|category|about)\b|,.{25,}|.{60,})",
    re.I,
)


def run(dry: bool) -> None:
    con = state.connect()
    rows = con.execute(
        """SELECT v.id, v.company_name, v.website_url FROM vendors v
           WHERE NOT EXISTS (SELECT 1 FROM vendor_states vs
                             WHERE vs.vendor_id = v.id AND vs.state = 'sleeping')
           ORDER BY v.id"""
    ).fetchall()
    messy = [r for r in rows if MESSY.search(r["company_name"] or "")]
    print(f"awake: {len(rows)} | messy titles going to Gemini: {len(messy)}")

    if dry:
        sample = messy[:BATCH]
        names = llm_batch(sample)
        for i, r in enumerate(sample):
            new = names.get(i, "")
            ok = new and new != r["company_name"] and grounded(new, r["company_name"], r["website_url"] or "")
            flag = "APPLY" if ok else ("skip " if not new else "UNGROUNDED")
            print(f"  [{flag}] {r['company_name'][:55]!r} -> {new[:40]!r}")
        print("dry run only — nothing written")
        return

    batches = [messy[i:i + BATCH] for i in range(0, len(messy), BATCH)]
    renames: list[tuple] = []
    skipped = ungrounded = 0

    def judge(batch):
        names = llm_batch(batch)
        out, sk, ug = [], 0, 0
        for i, r in enumerate(batch):
            new = names.get(i, "").strip()
            if not new or new == r["company_name"]:
                sk += 1
                continue
            if grounded(new, r["company_name"], r["website_url"] or ""):
                out.append((r["id"], r["company_name"], new))
            else:
                ug += 1
        return out, sk, ug

    done = 0
    with ThreadPoolExecutor(THREADS) as ex:
        for out, sk, ug in ex.map(judge, batches):
            renames.extend(out)
            skipped += sk
            ungrounded += ug
            done += 1
            if done % 50 == 0:
                print(f"  ...{done}/{len(batches)} batches, renames so far {len(renames)}")

    print(f"renames: {len(renames)} | unchanged: {skipped} | rejected as ungrounded: {ungrounded}")

    new_file = not LEDGER.exists()
    with LEDGER.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["vendor_id", "old_name", "new_name"])
        w.writerows(renames)

    con.executemany(
        "UPDATE vendors SET company_name = ?, last_updated = datetime('now') WHERE id = ?",
        [(new, vid) for vid, _old, new in renames],
    )
    con.commit()
    print(f"applied {len(renames)} renames (FTS auto-syncs via triggers)")
    print(f"gemini spend today: ${gemini.usage_today().get('est_cost', 0):.2f}")
    print(f"ledger: {LEDGER}")


if __name__ == "__main__":
    run(dry="--dry" in sys.argv)
