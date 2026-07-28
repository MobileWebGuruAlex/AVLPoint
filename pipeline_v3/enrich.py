"""Pipeline v3 enrichment — Claude Haiku 4.5 via the Batch API (50% discount).

submit: builds one batch from all 'scraped' vendors (bounded by the daily
        budget estimate), submits it, marks rows 'submitted'.
ingest: polls the batch; on completion writes profiles into vendors with
        ADD-ONLY merge semantics (never overwrites existing verified data),
        records exact token cost per vendor, marks 'done'.

Usage:
    python enrich.py submit [--limit N]
    python enrich.py ingest <batch_id>
    python enrich.py status <batch_id>
"""
from __future__ import annotations

import ast
import json
import os
import re
import sys
from pathlib import Path

import anthropic

import scraper
import state

CACHE_DIR = Path(__file__).resolve().parent / "cache"

MODEL = "claude-haiku-4-5"
MAX_OUT = 4096
EST_COST_PER_VENDOR = 0.03  # conservative pre-submit estimate for budget gating

# 2026-07-28 incident: with a full day's budget available, cap = remaining /
# EST_COST_PER_VENDOR computed 333 vendors for ONE batch request — each
# carrying up to 48K chars of scraped text, summing to a multi-MB JSON body.
# That oversized upload hit a Cloudflare 502 / dropped-connection twice in a
# row while plain small API calls succeeded instantly, so the daemon looped
# forever re-attempting the same fragile request. Batches API supports up to
# 100K requests / 256MB — this is nowhere near that ceiling; the point is
# reliability, not a hard limit. Small, frequent submissions survive a flaky
# connection; the budget is used across multiple calls in a cycle instead.
MAX_BATCH_SIZE = 100

SYSTEM = """You are the profile writer for AVLpoint, an industrial vendor directory used by \
procurement teams to find fabricators, machine shops, and manufacturers.

You will receive the scraped text of one vendor's website. Produce a complete, factual \
company profile. HARD RULES:
- Ground every statement in the provided text. NEVER invent certifications, equipment, \
capabilities, dates, or contact details. If the text doesn't support a field, leave it empty.
- The profile_summary must be ~800-1200 words of clear, professional prose covering: what \
the company does, its history and scale, capabilities and services, equipment and facilities, \
certifications and quality systems, industries served, and what differentiates it.
- Write for a procurement engineer deciding whether to request a quote.
- The profile_summary must be AT LEAST 800 words unless the source text is too thin to support it.
- Extract structured fields exactly as evidenced (e.g. "AS9100D", "AISC certified fabricator").
- contact_email and contact_phone must be copied CHARACTER-FOR-CHARACTER from the text. If no \
email or phone appears verbatim, return an empty string. Never reconstruct or guess them.
- If a REGISTRY / OPEN-DATA FACTS block is present, use it as corroborating evidence for \
founding year, employee count, legal name, jurisdiction, address, and NAICS/industry — these \
come from independent registries (Wikidata, OpenCorporates, EPA ECHO, OpenStreetMap). Prefer \
website text where they conflict, but registry facts may fill fields the website omits. Do NOT \
copy registry contact details into contact_email/contact_phone — those two fields come ONLY \
from the website text."""

SCHEMA = {
    "type": "object",
    "properties": {
        "profile_summary": {"type": "string"},
        "services": {"type": "array", "items": {"type": "string"}},
        "capabilities": {"type": "array", "items": {"type": "string"}},
        "certifications": {"type": "array", "items": {"type": "string"}},
        "industries_served": {"type": "array", "items": {"type": "string"}},
        "equipment": {"type": "array", "items": {"type": "string"}},
        "contact_email": {"type": "string"},
        "contact_phone": {"type": "string"},
        "year_established": {"type": "string"},
        "employee_count": {"type": "string"},
        "facility_size_sqft": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["profile_summary", "services", "capabilities", "certifications",
                 "industries_served", "equipment", "contact_email", "contact_phone",
                 "year_established", "employee_count", "facility_size_sqft", "confidence"],
    "additionalProperties": False,
}

# vendors columns that are filled ONLY if currently empty (add-only merge)
FILL_IF_EMPTY = {
    "contact_email": "contact_email",
    "contact_phone": "contact_phone",
    "year_established": "year_established",
    "employee_count": "employee_count",
    "facility_size_sqft": "facility_size_sqft",
}
# list-ish columns stored as JSON/text: merge with dedup, never remove
MERGE_LISTS = {
    "services": "services",
    "capabilities": "capabilities",
    "certifications": "certifications_held",
    "industries_served": "industries_served",
    "equipment": "equipment_list",
}


def client() -> anthropic.Anthropic:
    key = os.getenv("AVL_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        # fall back to .env
        for line in (Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
            if line.startswith(("AVL_ANTHROPIC_API_KEY=", "ANTHROPIC_API_KEY=")):
                key = line.split("=", 1)[1].strip()
                if key:
                    break
    if not key:
        sys.exit("no Anthropic API key found (AVL_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY)")
    return anthropic.Anthropic(api_key=key)


def submit(limit: int | None = None) -> None:
    con = state.connect()
    remaining = state.budget_remaining(con)
    cap = int(remaining / EST_COST_PER_VENDOR)
    if cap <= 0:
        print(f"daily budget exhausted (${state.budget_spent_today(con):.2f} spent) — try tomorrow")
        return
    n = min(limit or cap, cap, MAX_BATCH_SIZE)

    rows = con.execute(
        f"""SELECT s.vendor_id, v.company_name, v.website_url,
                  v.city, v.state_province, v.country
           FROM enrich_v3_state s JOIN vendors v ON v.id = s.vendor_id
           WHERE s.stage = 'scraped'
           ORDER BY {scraper.PRIORITY_ORDER} LIMIT ?""",
        [n],
    ).fetchall()
    if not rows:
        print("nothing in 'scraped' stage")
        return

    requests = []
    for r in rows:
        cache_file = CACHE_DIR / f"{r['vendor_id']}.json"
        if not cache_file.exists():
            state.set_stage(con, r["vendor_id"], "failed", error="cache file missing")
            continue
        scraped = json.loads(cache_file.read_text(encoding="utf-8"))
        loc = ", ".join(x for x in [r["city"], r["state_province"], r["country"]] if x)
        registry = scraped.get("registry") or {}
        registry_block = ""
        if registry:
            registry_block = (
                "\n\n--- REGISTRY / OPEN-DATA FACTS (independent sources; treat as "
                "corroborating evidence, cite when relevant) ---\n"
                + json.dumps(registry, indent=2)
            )
        user_msg = (
            f"Company: {r['company_name']}\nWebsite: {r['website_url']}\nLocation: {loc}\n\n"
            f"--- SCRAPED WEBSITE TEXT ({scraped['pages']} pages) ---\n{scraped['text']}"
            f"{registry_block}"
        )
        requests.append({
            "custom_id": f"v{r['vendor_id']}",
            "params": {
                "model": MODEL,
                "max_tokens": MAX_OUT,
                "system": [{"type": "text", "text": SYSTEM,
                            "cache_control": {"type": "ephemeral"}}],
                "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
                "messages": [{"role": "user", "content": user_msg}],
            },
        })

    if not requests:
        print("no valid requests")
        return

    batch = client().messages.batches.create(requests=requests)
    for r in rows:
        state.set_stage(con, r["vendor_id"], "submitted", batch_id=batch.id, model=MODEL)
    print(f"submitted batch {batch.id} with {len(requests)} vendors "
          f"(est ${len(requests) * EST_COST_PER_VENDOR:.2f}, budget left ${remaining:.2f})")


def status(batch_id: str) -> None:
    b = client().messages.batches.retrieve(batch_id)
    print(f"{batch_id}: {b.processing_status} — {b.request_counts}")


def _parse_listish(raw: str) -> list[str]:
    """Existing columns hold JSON lists, Python-repr lists, or comma strings."""
    for loader in (json.loads, ast.literal_eval):
        try:
            parsed = loader(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except (ValueError, TypeError, SyntaxError):
            continue
    return [x.strip() for x in raw.split(",") if x.strip()]


def _merge_list(existing: str | None, new_items: list[str]) -> str | None:
    """Union of existing + new; preserves everything already there.
    Flattens nested repr-strings like \"['CEMA Member']\" left by old pipelines."""
    cur: list[str] = []
    for item in _parse_listish(existing) if existing else []:
        if item.startswith("[") and item.endswith("]"):
            cur.extend(_parse_listish(item))
        else:
            cur.append(item)
    seen = {c.lower() for c in cur}
    for item in new_items:
        item = (item or "").strip()
        if item and item.lower() not in seen:
            cur.append(item)
            seen.add(item.lower())
    return json.dumps(cur) if cur else existing


EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


def _grounded(value: str, scraped_text: str) -> bool:
    """Contact details must literally appear in the scraped site text —
    anything the model 'found' that isn't on the site gets dropped."""
    v = (value or "").strip()
    if not v:
        return False
    if v.lower() in scraped_text.lower():
        return True
    # phones: compare digits only (formatting differs)
    digits = re.sub(r"\D", "", v)
    return bool(digits) and len(digits) >= 7 and digits in re.sub(r"\D", "", scraped_text)


def ingest(batch_id: str) -> None:
    con = state.connect()
    cl = client()
    b = cl.messages.batches.retrieve(batch_id)
    if b.processing_status != "ended":
        print(f"batch not finished: {b.processing_status} ({b.request_counts})")
        return

    done = failed = 0
    total_cost = 0.0
    for result in cl.messages.batches.results(batch_id):
        vid = int(result.custom_id[1:])
        if result.result.type != "succeeded":
            state.set_stage(con, vid, "failed", error=f"batch result: {result.result.type}")
            failed += 1
            continue
        msg = result.result.message
        cost = state.cost_from_usage(msg.usage)
        total_cost += cost
        try:
            text = next(bk.text for bk in msg.content if bk.type == "text")
            data = json.loads(text)
        except (StopIteration, ValueError) as e:
            state.set_stage(con, vid, "failed", error=f"parse: {e}", cost_usd=cost)
            failed += 1
            continue

        row = con.execute("SELECT * FROM vendors WHERE id = ?", [vid]).fetchone()
        if row is None:
            state.set_stage(con, vid, "failed", error="vendor row gone")
            failed += 1
            continue

        # grounding guard: contact details must exist verbatim in the scraped text
        cache_file = CACHE_DIR / f"{vid}.json"
        scraped_text, scraped_logo, scraped_photos = "", None, []
        if cache_file.exists():
            cache = json.loads(cache_file.read_text(encoding="utf-8"))
            scraped_text = cache.get("text", "")
            scraped_logo = cache.get("logo")
            scraped_photos = cache.get("photos") or []
        email = (data.get("contact_email") or "").strip()
        if email and (not EMAIL_RE.match(email) or not _grounded(email, scraped_text)):
            data["contact_email"] = ""
        phone = (data.get("contact_phone") or "").strip()
        if phone and not _grounded(phone, scraped_text):
            data["contact_phone"] = ""

        sets, vals = [], []
        # profile: always write ai_summary (this is the field we're building)
        sets.append("ai_summary = ?")
        vals.append(data["profile_summary"])
        # scalars: fill only if empty — NEVER overwrite existing data
        for src, col in FILL_IF_EMPTY.items():
            existing = row[col]
            is_empty = existing is None or (isinstance(existing, str) and not existing.strip())
            if data.get(src) and is_empty:
                sets.append(f"{col} = ?")
                vals.append(data[src])
        # lists: union-merge, never remove
        for src, col in MERGE_LISTS.items():
            merged = _merge_list(row[col], data.get(src) or [])
            if merged and merged != row[col]:
                sets.append(f"{col} = ?")
                vals.append(merged)
        # images: logo + up to 4 photos from the site (5 max — more is a paid
        # feature). Fill-if-empty only, like every other field.
        if scraped_logo and not (row["logo_url"] or "").strip():
            sets.append("logo_url = ?")
            vals.append(scraped_logo)
        if scraped_photos:
            existing_imgs = (row["representative_images"] or "").strip()
            if not existing_imgs or existing_imgs == "[]":
                sets.append("representative_images = ?")
                vals.append(json.dumps(scraped_photos[:4]))
        sets.append("lifecycle_stage = CASE WHEN lifecycle_stage IN ('locked','fully_built') "
                    "THEN lifecycle_stage ELSE 'enriched' END")
        sets.append("last_updated = datetime('now')")
        vals.append(vid)
        con.execute(f"UPDATE vendors SET {', '.join(sets)} WHERE id = ?", vals)

        state.set_stage(con, vid, "done",
                        tokens_in=msg.usage.input_tokens,
                        tokens_out=msg.usage.output_tokens,
                        cost_usd=cost, error=None)
        done += 1

    state.budget_add(con, total_cost)
    con.commit()
    print(f"ingested: {done} done, {failed} failed, actual cost ${total_cost:.4f}")
    print(f"today's spend: ${state.budget_spent_today(con):.4f} / ${state.DAILY_BUDGET_USD:.2f}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "submit"
    if cmd == "submit":
        lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
        submit(lim)
    elif cmd == "status":
        status(sys.argv[2])
    elif cmd == "ingest":
        ingest(sys.argv[2])
    else:
        sys.exit(__doc__)
