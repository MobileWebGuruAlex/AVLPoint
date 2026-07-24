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

import json
import os
import sys
from pathlib import Path

import anthropic

import state

CACHE_DIR = Path(__file__).resolve().parent / "cache"

MODEL = "claude-haiku-4-5"
MAX_OUT = 4096
EST_COST_PER_VENDOR = 0.03  # conservative pre-submit estimate for budget gating

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
- Extract structured fields exactly as evidenced (e.g. "AS9100D", "AISC certified fabricator").
- contact_email/contact_phone only if explicitly present in the text."""

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
    n = min(limit or cap, cap)

    rows = con.execute(
        """SELECT s.vendor_id, v.company_name, v.website_url,
                  v.city, v.state_province, v.country
           FROM enrich_v3_state s JOIN vendors v ON v.id = s.vendor_id
           WHERE s.stage = 'scraped' ORDER BY s.vendor_id LIMIT ?""",
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
        user_msg = (
            f"Company: {r['company_name']}\nWebsite: {r['website_url']}\nLocation: {loc}\n\n"
            f"--- SCRAPED WEBSITE TEXT ({scraped['pages']} pages) ---\n{scraped['text']}"
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


def _merge_list(existing: str | None, new_items: list[str]) -> str | None:
    """Union of existing + new; preserves everything already there."""
    cur: list[str] = []
    if existing:
        try:
            parsed = json.loads(existing)
            cur = parsed if isinstance(parsed, list) else [str(parsed)]
        except (ValueError, TypeError):
            cur = [x.strip() for x in str(existing).split(",") if x.strip()]
    seen = {c.lower() for c in cur}
    for item in new_items:
        if item and item.lower() not in seen:
            cur.append(item)
            seen.add(item.lower())
    return json.dumps(cur) if cur else existing


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
