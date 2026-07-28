"""Pipeline v3 daemon — continuous enrichment within the daily budget.

Loop: seed new verified vendors -> scrape a wave -> submit a batch ->
poll & ingest -> repeat. Stops submitting when the daily budget is hit,
keeps polling open batches, sleeps, tries again. Safe to kill and restart
at any moment — all state lives in enrich_v3_state.

Run:      python daemon.py
Install:  powershell -File run_v3.ps1 (or register scheduled task, see spec)
"""
from __future__ import annotations

import atexit
import os
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

LOCK = Path(__file__).resolve().parent / ".daemon.lock"
HERE = Path(__file__).resolve().parent

# 2026-07-25 incident: a crashed Playwright browser left the daemon's asyncio
# event loop wedged on an uncancellable await — the process never exited,
# never released the lock, and blocked every scheduled run for 3 days.
# Fix: run every Playwright-based step as a CHILD PROCESS with a hard
# wall-clock timeout. If it hangs for any reason, we kill the process tree
# and move on — the daemon itself can no longer get stuck.
STEP_TIMEOUT_S = 25 * 60


def run_step_subprocess(script: str, arg: int) -> bool:
    """Run a pipeline step (scraper.py / contacts.py) as a subprocess with a
    hard timeout. Returns True on a clean exit, False on timeout or error —
    either way the daemon continues to the next step/cycle."""
    proc = subprocess.Popen(
        [sys.executable, str(HERE / script), str(arg)],
        cwd=str(HERE),
    )
    try:
        code = proc.wait(timeout=STEP_TIMEOUT_S)
        if code != 0:
            print(f"[daemon] {script} exited with code {code}")
        return code == 0
    except subprocess.TimeoutExpired:
        print(f"[daemon] {script} exceeded {STEP_TIMEOUT_S}s — killing it "
              f"(likely a wedged browser) and continuing")
        try:
            # Kill the whole tree (script + any leaked Chromium children).
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                          capture_output=True)
        except Exception:
            proc.kill()
        return False


def acquire_lock() -> bool:
    """One cycle at a time. A stale lock (dead PID or >6h old) is replaced —
    a crash or hard reboot must never wedge the schedule."""
    if LOCK.exists():
        try:
            pid = int(LOCK.read_text().strip() or 0)
            alive = pid and os.popen(f'tasklist /FI "PID eq {pid}" /NH').read().strip().lower().startswith("python")
            fresh = (time.time() - LOCK.stat().st_mtime) < 6 * 3600
            if alive and fresh:
                return False
        except Exception:
            pass
        LOCK.unlink(missing_ok=True)
    LOCK.write_text(str(os.getpid()))
    atexit.register(lambda: LOCK.unlink(missing_ok=True))
    return True

import augment
import enrich
import state

WAVE_SIZE = 200          # vendors scraped per cycle
CONTACT_WAVE = 150       # vendors per contact-recovery pass (free/near-free)
CYCLE_SLEEP_S = 4 * 3600 # 4-hour schedule between full cycles
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


def main(once: bool = False) -> None:
    if not acquire_lock():
        print("another cycle is already running; exiting (next firing will retry)")
        return
    print(f"pipeline v3 {'single cycle' if once else 'daemon'} starting")
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

            # 2) budget check — if spent out, keep polling batches but don't submit
            remaining = state.budget_remaining(con)
            budget_ok = remaining >= enrich.EST_COST_PER_VENDOR
            if not budget_ok:
                print(f"[daemon] budget done for today "
                      f"(${state.budget_spent_today(con):.2f}); no new submissions")

            # 3) top up the queue: new verified vendors + stale refreshes
            seeded = state.seed_queue(con)
            stale = requeue_stale(con)
            if seeded or stale:
                print(f"[daemon] queued {seeded} new, {stale} stale")

            # 4) scrape a wave if anything is queued (free — always do it)
            queued = con.execute(
                "SELECT COUNT(*) n FROM enrich_v3_state WHERE stage='queued'"
            ).fetchone()["n"]
            if queued:
                n = min(queued, WAVE_SIZE)
                print(f"[daemon] scraping {n} vendors")
                run_step_subprocess("scraper.py", n)

            # 5) augment scraped vendors with free registry sources + junk triage
            #    (free/near-free; runs regardless of the enrichment budget)
            scraped = con.execute(
                "SELECT COUNT(*) n FROM enrich_v3_state WHERE stage='scraped'"
            ).fetchone()["n"]
            if scraped:
                print(f"[daemon] augmenting {scraped} vendors (registries + triage)")
                augment.run(scraped)

            # 6) contact recovery — delta-only, free Tier A + cheap Gemini Flash
            #    fallback. Independent of the Haiku enrichment budget.
            print("[daemon] contact recovery pass")
            run_step_subprocess("contacts.py", CONTACT_WAVE)

            # 7) submit whatever survived triage, bounded by budget
            if budget_ok:
                ready = con.execute(
                    "SELECT COUNT(*) n FROM enrich_v3_state WHERE stage='scraped'"
                ).fetchone()["n"]
                if ready:
                    enrich.submit()

            # 8) wait: poll faster while a batch runs, else hold the 4-hour cadence
            if open_batches(con):
                if once:
                    print("[daemon] batch still processing; next scheduled run will ingest it")
                    return
                time.sleep(POLL_SLEEP_S)
            else:
                if once:
                    print("[daemon] cycle complete")
                    return
                print(f"[daemon] cycle complete; next cycle in {CYCLE_SLEEP_S // 3600}h")
                time.sleep(CYCLE_SLEEP_S)
        except KeyboardInterrupt:
            print("daemon stopped")
            return
        except Exception as e:
            print(f"[daemon] cycle error: {e}; sleeping 5m")
            time.sleep(300)
        finally:
            con.close()


if __name__ == "__main__":
    main(once="--once" in sys.argv)
