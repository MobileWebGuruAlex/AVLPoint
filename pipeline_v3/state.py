"""Pipeline v3 state — one row per vendor, one source of truth.

Stages: queued -> scraped -> submitted -> done | failed
Nothing re-runs unless the scraped content hash changes or an operator resets it.
Budget is tracked per-day in enrich_v3_budget; the daemon refuses to submit
past the daily cap.
"""
from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "vendors.db"

DAILY_BUDGET_USD = 10.00

# Haiku 4.5 Batch API rates ($/Mtok): input 0.50, output 2.50,
# cache writes 0.625, cache reads 0.05
RATE_IN = 0.50 / 1_000_000
RATE_OUT = 2.50 / 1_000_000
RATE_CACHE_WRITE = 0.625 / 1_000_000
RATE_CACHE_READ = 0.05 / 1_000_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS enrich_v3_state (
    vendor_id     INTEGER PRIMARY KEY,
    stage         TEXT NOT NULL DEFAULT 'queued',
    content_hash  TEXT,
    pages_scraped INTEGER DEFAULT 0,
    batch_id      TEXT,
    model         TEXT,
    tokens_in     INTEGER DEFAULT 0,
    tokens_out    INTEGER DEFAULT 0,
    cost_usd      REAL DEFAULT 0,
    attempts      INTEGER DEFAULT 0,
    error         TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_v3_stage ON enrich_v3_state(stage);

CREATE TABLE IF NOT EXISTS enrich_v3_budget (
    day       TEXT PRIMARY KEY,
    spent_usd REAL NOT NULL DEFAULT 0
);
"""


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    con.executescript(SCHEMA)
    return con


def seed_queue(con: sqlite3.Connection, limit: int | None = None) -> int:
    """Queue verified vendors with a website that have no v3 state yet.
    Never touches vendor rows; sleeping vendors are excluded."""
    sql = """
    INSERT OR IGNORE INTO enrich_v3_state (vendor_id, stage)
    SELECT v.id, 'queued' FROM vendors v
    WHERE v.completeness_status = 'verified'
      AND v.website_url IS NOT NULL AND v.website_url != ''
      AND NOT EXISTS (SELECT 1 FROM vendor_states vs
                      WHERE vs.vendor_id = v.id AND vs.state = 'sleeping')
    ORDER BY v.enterprise_tier ASC, v.enterprise_suitability_score DESC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    cur = con.execute(sql)
    con.commit()
    return cur.rowcount


def set_stage(con, vendor_id: int, stage: str, **fields) -> None:
    cols = ", ".join(f"{k} = ?" for k in fields)
    sql = f"UPDATE enrich_v3_state SET stage = ?, updated_at = datetime('now'){', ' + cols if cols else ''} WHERE vendor_id = ?"
    con.execute(sql, [stage, *fields.values(), vendor_id])
    con.commit()


def budget_spent_today(con) -> float:
    row = con.execute(
        "SELECT spent_usd FROM enrich_v3_budget WHERE day = ?", [date.today().isoformat()]
    ).fetchone()
    return row["spent_usd"] if row else 0.0


def budget_add(con, amount: float) -> None:
    con.execute(
        """INSERT INTO enrich_v3_budget (day, spent_usd) VALUES (?, ?)
           ON CONFLICT(day) DO UPDATE SET spent_usd = spent_usd + excluded.spent_usd""",
        [date.today().isoformat(), amount],
    )
    con.commit()


def budget_remaining(con) -> float:
    return max(0.0, DAILY_BUDGET_USD - budget_spent_today(con))


def cost_from_usage(usage) -> float:
    return (
        getattr(usage, "input_tokens", 0) * RATE_IN
        + getattr(usage, "output_tokens", 0) * RATE_OUT
        + (getattr(usage, "cache_creation_input_tokens", 0) or 0) * RATE_CACHE_WRITE
        + (getattr(usage, "cache_read_input_tokens", 0) or 0) * RATE_CACHE_READ
    )


def stats(con) -> dict:
    rows = con.execute(
        "SELECT stage, COUNT(*) n, ROUND(SUM(cost_usd), 4) cost FROM enrich_v3_state GROUP BY stage"
    ).fetchall()
    return {r["stage"]: {"count": r["n"], "cost": r["cost"] or 0} for r in rows}
