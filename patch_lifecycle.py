"""
patch_lifecycle.py — One-time backfill for enterprise_tier and lifecycle_stage.

Runs in-process against vendors.db directly (no AsyncDB overhead) and
processes all 80,772 rows in batches of 2,000.

What it does:
  1. Runs schema migrations to add the two new columns if not present.
  2. Scores every row with assess_enterprise_tier().
  3. Marks lifecycle_stage='fully_built' for any row that passes is_fully_built().
  4. Writes results in batches — no record is deleted or degraded.

Safe to re-run: CASE expressions and IF NOT EXISTS make it idempotent.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sqlite3
import json
import time

# Import the two new functions from db_async
from db_async import assess_enterprise_tier, is_fully_built, VendorRecord

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendors.db")
BATCH_SIZE = 2000

def run_migrations(conn):
    migrations = [
        "ALTER TABLE vendors ADD COLUMN lifecycle_stage TEXT DEFAULT 'discovered'",
        "ALTER TABLE vendors ADD COLUMN enterprise_tier INTEGER DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS idx_vendors_lifecycle ON vendors(lifecycle_stage)",
        "CREATE INDEX IF NOT EXISTS idx_vendors_enterprise_tier ON vendors(enterprise_tier)",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                pass  # idempotent
            else:
                raise
    conn.commit()
    print("[migrations] Schema columns and indexes applied.")

def row_to_vlike(row: sqlite3.Row) -> dict:
    """Convert a sqlite3.Row to a plain dict for assess_enterprise_tier / is_fully_built."""
    d = dict(row)
    # Deserialize JSON list fields
    for f in ("certifications_held", "notable_customers", "services", "key_personnel"):
        val = d.get(f) or "[]"
        try:
            d[f] = json.loads(val)
        except Exception:
            d[f] = []
    return d

def main():
    conn = sqlite3.connect(DB_PATH, timeout=120)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")

    print(f"[backfill] Connected to {DB_PATH}")
    run_migrations(conn)

    # Total count
    total = conn.execute("SELECT COUNT(*) FROM vendors").fetchone()[0]
    print(f"[backfill] Total rows: {total:,}")

    # Stats counters
    tier1 = tier2 = tier3 = fully_built_count = 0
    processed = 0
    t0 = time.time()

    offset = 0
    while True:
        rows = conn.execute(
            "SELECT * FROM vendors LIMIT ? OFFSET ?", (BATCH_SIZE, offset)
        ).fetchall()
        if not rows:
            break

        updates = []
        for row in rows:
            d = row_to_vlike(row)
            t = assess_enterprise_tier(d)
            fb = is_fully_built(d) and t != 3

            # Protect existing fully_built / locked — don't downgrade
            current_stage = d.get("lifecycle_stage") or "discovered"
            if current_stage in ("fully_built", "locked"):
                new_stage = current_stage
            elif fb:
                new_stage = "fully_built"
            else:
                new_stage = current_stage  # preserve discovered / enriched / disqualified

            # Count
            if t == 1:   tier1 += 1
            elif t == 2: tier2 += 1
            else:        tier3 += 1
            if new_stage == "fully_built": fully_built_count += 1

            updates.append((t, new_stage, d["company_name"]))

        conn.executemany(
            "UPDATE vendors SET enterprise_tier=?, lifecycle_stage=CASE WHEN lifecycle_stage IN ('fully_built','locked') THEN lifecycle_stage ELSE ? END WHERE company_name=?",
            updates
        )
        conn.commit()

        processed += len(rows)
        offset += BATCH_SIZE
        elapsed = time.time() - t0
        rate = processed / elapsed if elapsed > 0 else 0
        print(f"[backfill] {processed:,}/{total:,} rows | {rate:.0f} rows/s | T1={tier1:,} T2={tier2:,} T3={tier3:,} | fully_built={fully_built_count}")

    conn.close()
    elapsed_total = time.time() - t0
    print(f"\n[backfill] COMPLETE in {elapsed_total:.1f}s")
    print(f"  Tier 1 (large enterprise): {tier1:,}  ({tier1/total*100:.1f}%)")
    print(f"  Tier 2 (regional):         {tier2:,}  ({tier2/total*100:.1f}%)")
    print(f"  Tier 3 (small/unclear):    {tier3:,}  ({tier3/total*100:.1f}%)")
    print(f"  Fully built (locked):      {fully_built_count:,}")
    print(f"  Tier 3 excluded from enrichment immediately.")

if __name__ == "__main__":
    main()
