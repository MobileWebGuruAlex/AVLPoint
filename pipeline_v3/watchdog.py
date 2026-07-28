"""Pipeline v3 watchdog — independent stall detector and auto-recovery.

Runs on ITS OWN Windows Scheduled Task (every 15 min), completely separate
from the main daemon task. Deliberately dumb and dependency-light (stdlib +
sqlite only, no Playwright/network/imports of scraper/augment/contacts/enrich)
so a bug in the pipeline can never take the watchdog down with it too.

Incident 2026-07-25: a crashed Playwright browser wedged the daemon's event
loop on an uncancellable await. The process never exited, never released
its lock, and every scheduled run backed off for 3 days because it looked
"still running." Fixed at the source (daemon.py now runs Playwright steps
as timeout-bounded child processes) — this watchdog is the second,
independent layer: even an unforeseen new hang gets caught and cleared
within one interval instead of running unnoticed for days.

Stall definition: the lock file is held AND is older than STALL_MINUTES.
That's it — no LLM call, no diagnosis needed. A hung process needs a kill
switch, not an opinion.

On stall: kill the locked PID's whole process tree, clear the lock, relaunch
`daemon.py --once` detached, and append one line to watchdog.log. On a
healthy check: append a quiet heartbeat line (stage counts) so a human can
audit activity without invoking Claude at all.
"""
from __future__ import annotations

import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOCK = HERE / ".daemon.lock"
WATCHDOG_LOG = HERE / "watchdog.log"
DB = HERE.parent / "vendors.db"

STALL_MINUTES = 60  # a healthy --once cycle finishes well under this


def log(line: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    with WATCHDOG_LOG.open("a", encoding="utf-8") as f:
        f.write(f"[{stamp}] {line}\n")


def stage_counts() -> str:
    """Read stage counts directly via sqlite3 CLI-free stdlib connection —
    no dependency on state.py, so a bug there can't break the watchdog."""
    import sqlite3
    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
        rows = con.execute(
            "SELECT stage, COUNT(*) n FROM enrich_v3_state GROUP BY stage"
        ).fetchall()
        con.close()
        return ", ".join(f"{s}={n}" for s, n in sorted(rows))
    except Exception as e:
        return f"(db read failed: {e})"


def lock_age_minutes() -> float | None:
    if not LOCK.exists():
        return None
    return (time.time() - LOCK.stat().st_mtime) / 60


def kill_tree(pid: int) -> None:
    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)


def main() -> None:
    age = lock_age_minutes()

    if age is None:
        log(f"OK — idle, no lock held. {stage_counts()}")
        return

    if age < STALL_MINUTES:
        log(f"OK — cycle in progress ({age:.0f} min). {stage_counts()}")
        return

    # Stalled. Deterministic recovery — no diagnosis, no judgment call needed.
    try:
        pid = int(LOCK.read_text().strip() or 0)
    except Exception:
        pid = 0

    log(f"STALL DETECTED — lock held {age:.0f} min (>{STALL_MINUTES}), pid={pid}. "
        f"Killing process tree, clearing lock, relaunching daemon.")

    if pid:
        kill_tree(pid)
    LOCK.unlink(missing_ok=True)

    # Detached relaunch — the watchdog itself must exit quickly every run.
    subprocess.Popen(
        [sys.executable, str(HERE / "daemon.py"), "--once"],
        cwd=str(HERE),
        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
        stdout=open(HERE / "daemon.log", "a"),
        stderr=subprocess.STDOUT,
    )
    log(f"Recovery relaunch started. {stage_counts()}")


if __name__ == "__main__":
    main()
