"""Pipeline v3 daemon — continuous enrichment within the daily budget.

Loop: seed new verified vendors -> scrape a wave -> submit a batch ->
poll & ingest -> repeat. Stops submitting when the daily budget is hit,
keeps polling open batches, sleeps, tries again. Safe to kill and restart
at any moment — all state lives in enrich_v3_state.

Run:      python daemon.py
Install:  powershell -File run_v3.ps1 (or register scheduled task, see spec)
"""
from __future__ import annotations

import asyncio
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import enrich
import scraper
import state

WAVE_SIZE = 200          # vendors scraped per cycle
IDLE_SLEEP_S = 15 * 60   # when budget exhausted or queue empty
POLL_SLEEP_S = 120       # while a batch is processing
STALE_DAYS = 90          # re-queue done vendors older than this (refresh cycle)


def requeue_stale(con) -> int:
    cur = con.execute(
        """UPDATE enrich_v3_state SET stage = 'queued', error = NULL
           WHERE stage = 'done'
             AND updated_at < datetime('now', ?)""",
        [f"-{STALE_DAYS} day"],
    )
    con.commit()
    return cur.rowcount


def open_batches(con) -> list[str]:
    return [r["batch_id"] for r in con.execute(
        "SELECT DISTINCT batch_id FROM enrich_v3_state WHERE stage = 'submitted' AND batch_id IS NOT NULL"
    )]


def main() -> None:
    print("pipeline v3 daemon starting")
    while True:
        con = state.connect()
        try:
            # 1) ingest any finished batches
            cl = enrich.client()
            for bid in open_batches(con):
                b = cl.messages.batches.retrieve(bid)
                if b.processing_status == "ended":
                    print(f"[daemon] ingesting {bid}")
                    enrich.ingest(bid)

            # 2) budget check
            remaining = state.budget_remaining(con)
            if remaining < enrich.EST_COST_PER_VENDOR:
                print(f"[daemon] budget done for today "
                      f"(${state.budget_spent_today(con):.2f}); sleeping")
                time.sleep(IDLE_SLEEP_S)
                continue

            # 3) top up the queue: new verified vendors + stale refreshes
            seeded = state.seed_queue(con)
            stale = requeue_stale(con)
            if seeded or stale:
                print(f"[daemon] queued {seeded} new, {stale} stale")

            # 4) scrape a wave if anything is queued
            queued = con.execute(
                "SELECT COUNT(*) n FROM enrich_v3_state WHERE stage='queued'"
            ).fetchone()["n"]
            if queued:
                n = min(queued, WAVE_SIZE)
                print(f"[daemon] scraping {n} vendors")
                asyncio.run(scraper.run(n))

            # 5) submit whatever is scraped, bounded by budget
            scraped = con.execute(
                "SELECT COUNT(*) n FROM enrich_v3_state WHERE stage='scraped'"
            ).fetchone()["n"]
            if scraped:
                enrich.submit()

            # 6) wait for batches / next cycle
            if open_batches(con):
                time.sleep(POLL_SLEEP_S)
            elif not queued and not scraped:
                print("[daemon] queue empty; sleeping")
                time.sleep(IDLE_SLEEP_S)
        except KeyboardInterrupt:
            print("daemon stopped")
            return
        except Exception as e:
            print(f"[daemon] cycle error: {e}; sleeping 5m")
            time.sleep(300)
        finally:
            con.close()


if __name__ == "__main__":
    main()
