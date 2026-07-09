"""
AVLpoint Daily Executive Report — Data Collector
Gathers every metric from databases, logs, scheduled tasks, and the website.
Returns a single ReportData object consumed by all renderers.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from reporting.report_config import (
    VENDORS_DB, VENDORS_INTL_DB, LOG_DIR, BACKUP_DIR,
    WEBSITE_BASE, HEALTH_ENDPOINTS, HISTORY_FILE, REPORTS_DIR,
    PIPELINE_TASK_PATH, PIPELINE_TASK_NAME,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Data classes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@dataclass
class HealthStatus:
    """Traffic-light status for any subsystem."""
    status: str = "healthy"          # healthy | warning | critical
    message: str = ""
    details: list[str] = field(default_factory=list)


@dataclass
class DatabaseMetrics:
    us_total: int = 0
    us_verified: int = 0
    us_with_description: int = 0
    us_with_email: int = 0
    us_with_phone: int = 0
    us_with_website: int = 0
    us_enrichment_pct: float = 0.0
    intl_total: int = 0
    intl_with_description: int = 0
    intl_with_website: int = 0
    combined_total: int = 0
    tier_distribution: dict[str, int] = field(default_factory=dict)
    top_business_types: list[tuple[str, int]] = field(default_factory=list)
    top_countries: list[tuple[str, int]] = field(default_factory=list)
    db_size_mb: float = 0.0
    intl_db_size_mb: float = 0.0
    health: HealthStatus = field(default_factory=HealthStatus)


@dataclass
class PipelineRun:
    timestamp: str = ""
    phase1_duration_min: float = 0.0
    phase1_exit: str = ""
    phase2_duration_min: float = 0.0
    phase2_exit: str = ""
    enriched_count: int = 0
    discovered_count: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class PipelineMetrics:
    runs_today: int = 0
    total_enriched_today: int = 0
    total_discovered_today: int = 0
    total_errors_today: int = 0
    runs: list[PipelineRun] = field(default_factory=list)
    scheduler_state: str = ""
    scheduler_last_run: str = ""
    scheduler_next_run: str = ""
    scheduler_missed: int = 0
    agentwiki_status: str = ""
    backup_status: str = ""
    backup_last: str = ""
    health: HealthStatus = field(default_factory=HealthStatus)


@dataclass
class EndpointCheck:
    path: str = ""
    name: str = ""
    status_code: int = 0
    response_ms: float = 0.0
    ok: bool = False


@dataclass
class WebsiteMetrics:
    base_url: str = ""
    endpoints: list[EndpointCheck] = field(default_factory=list)
    avg_response_ms: float = 0.0
    all_ok: bool = False
    dev_server_uptime_hrs: float = 0.0
    health: HealthStatus = field(default_factory=HealthStatus)


@dataclass
class DeltaMetrics:
    """Change since previous report."""
    us_total_delta: int = 0
    intl_total_delta: int = 0
    combined_delta: int = 0
    us_verified_delta: int = 0
    runs_delta: int = 0
    has_previous: bool = False
    previous_date: str = ""
    history_7d: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ReportData:
    generated_at: str = ""
    report_date: str = ""
    database: DatabaseMetrics = field(default_factory=DatabaseMetrics)
    pipeline: PipelineMetrics = field(default_factory=PipelineMetrics)
    website: WebsiteMetrics = field(default_factory=WebsiteMetrics)
    deltas: DeltaMetrics = field(default_factory=DeltaMetrics)
    overall_health: HealthStatus = field(default_factory=HealthStatus)
    issues: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database collector
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _safe_count(conn: sqlite3.Connection, sql: str) -> int:
    try:
        return conn.execute(sql).fetchone()[0]
    except Exception:
        return 0


def collect_database() -> DatabaseMetrics:
    m = DatabaseMetrics()
    try:
        c = sqlite3.connect(str(VENDORS_DB), timeout=10)
        c.execute("PRAGMA journal_mode=WAL")

        m.us_total = _safe_count(c, "SELECT count(*) FROM vendors")
        m.us_verified = _safe_count(c, "SELECT count(*) FROM vendors WHERE completeness_status='verified'")
        m.us_with_description = _safe_count(c, "SELECT count(*) FROM vendors WHERE company_description IS NOT NULL AND company_description != ''")
        m.us_with_email = _safe_count(c, "SELECT count(*) FROM vendors WHERE contact_email IS NOT NULL AND contact_email != ''")
        m.us_with_phone = _safe_count(c, "SELECT count(*) FROM vendors WHERE contact_phone IS NOT NULL AND contact_phone != ''")
        m.us_with_website = _safe_count(c, "SELECT count(*) FROM vendors WHERE website_url IS NOT NULL AND website_url != ''")
        m.us_enrichment_pct = round(m.us_verified / max(m.us_total, 1) * 100, 1)

        # Tier distribution
        try:
            rows = c.execute("SELECT enterprise_tier, count(*) FROM vendors GROUP BY enterprise_tier ORDER BY enterprise_tier").fetchall()
            m.tier_distribution = {f"Tier {r[0]}": r[1] for r in rows if r[0] is not None}
        except Exception:
            pass

        # Top business types
        try:
            m.top_business_types = c.execute(
                "SELECT primary_business_type, count(*) as cnt FROM vendors "
                "WHERE primary_business_type IS NOT NULL AND primary_business_type != '' "
                "GROUP BY primary_business_type ORDER BY cnt DESC LIMIT 8"
            ).fetchall()
        except Exception:
            pass

        # Top countries
        try:
            m.top_countries = c.execute(
                "SELECT country, count(*) as cnt FROM vendors "
                "WHERE country IS NOT NULL AND country != '' "
                "GROUP BY country ORDER BY cnt DESC LIMIT 10"
            ).fetchall()
        except Exception:
            pass

        c.close()
        m.db_size_mb = round(VENDORS_DB.stat().st_size / (1024 * 1024), 1) if VENDORS_DB.exists() else 0

    except Exception as e:
        m.health = HealthStatus("critical", f"US DB error: {e}")
        return m

    # International DB
    try:
        c2 = sqlite3.connect(str(VENDORS_INTL_DB), timeout=10)
        c2.execute("PRAGMA journal_mode=WAL")
        m.intl_total = _safe_count(c2, "SELECT count(*) FROM vendors")
        m.intl_with_description = _safe_count(c2, "SELECT count(*) FROM vendors WHERE company_description IS NOT NULL AND company_description != ''")
        m.intl_with_website = _safe_count(c2, "SELECT count(*) FROM vendors WHERE website_url IS NOT NULL AND website_url != ''")
        c2.close()
        m.intl_db_size_mb = round(VENDORS_INTL_DB.stat().st_size / (1024 * 1024), 1) if VENDORS_INTL_DB.exists() else 0
    except Exception as e:
        m.health = HealthStatus("warning", f"Intl DB error: {e}")

    m.combined_total = m.us_total + m.intl_total

    if m.health.status == "healthy":
        if m.us_enrichment_pct < 5:
            m.health = HealthStatus("warning", f"Low enrichment rate: {m.us_enrichment_pct}%")
        else:
            m.health = HealthStatus("healthy", f"{m.combined_total:,} vendors, {m.us_enrichment_pct}% enriched")

    return m


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pipeline log collector
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _parse_pipeline_log(log_path: Path) -> PipelineRun:
    run = PipelineRun()
    text = log_path.read_text(encoding="utf-8", errors="replace")
    run.timestamp = log_path.name.replace("pipeline_", "").replace(".log", "")

    # Phase 1 duration
    m = re.search(r"Phase 1 completed.*?Duration:\s*([\d.]+)\s*min", text)
    if m:
        run.phase1_duration_min = float(m.group(1))
    m = re.search(r"Phase 1 completed.*?Exit code:\s*(\S*)", text)
    if m:
        run.phase1_exit = m.group(1).rstrip(",")

    # Phase 2 duration
    m = re.search(r"Phase 2 completed.*?Duration:\s*([\d.]+)\s*min", text)
    if m:
        run.phase2_duration_min = float(m.group(1))
    m = re.search(r"Phase 2 completed.*?Exit code:\s*(\S*)", text)
    if m:
        run.phase2_exit = m.group(1).rstrip(",")

    # Errors
    for line in text.split("\n"):
        if "ERROR" in line.upper() or "Traceback" in line or "FATAL" in line.upper():
            run.errors.append(line.strip()[:200])

    return run


def _parse_enrichment_counts(date_str: str) -> tuple[int, int]:
    """Parse enrichment stderr logs for enriched/discovered counts."""
    enriched = 0
    discovered = 0
    pattern = f"enrich_stderr_{date_str}*"
    for log_path in sorted(LOG_DIR.glob(pattern)):
        try:
            text = log_path.read_text(encoding="utf-8", errors="replace")
            # Find "Enriched X vendors" lines
            for m in re.finditer(r"Enriched (\d+) vendors", text):
                enriched += int(m.group(1))
            # Find "Written Session: NNNNN records"
            matches = list(re.finditer(r"Written Session:\s+([\d,]+)\s+records", text))
            if matches:
                last = matches[-1]
                discovered = max(discovered, int(last.group(1).replace(",", "")))
        except Exception:
            pass
    return enriched, discovered


def collect_pipeline(report_date: str) -> PipelineMetrics:
    m = PipelineMetrics()
    date_str = report_date  # "2026-07-08"

    # Parse pipeline main logs
    main_logs = sorted(LOG_DIR.glob(f"pipeline_{date_str}_*.log"))
    main_logs = [p for p in main_logs if "stderr" not in p.name and "stdout" not in p.name]

    for log_path in main_logs:
        run = _parse_pipeline_log(log_path)
        m.runs.append(run)
        m.total_errors_today += len(run.errors)

    m.runs_today = len(m.runs)

    # Parse enrichment counts from stderr logs
    enriched, discovered = _parse_enrichment_counts(date_str)
    m.total_enriched_today = enriched
    m.total_discovered_today = discovered

    # Check AgentWiki status from the last log
    if main_logs:
        last_text = main_logs[-1].read_text(encoding="utf-8", errors="replace")
        if "UnicodeEncodeError" in last_text:
            m.agentwiki_status = "crash_unicode"
        elif "AgentWiki Sync complete" in last_text or "Successfully created" in last_text:
            m.agentwiki_status = "ok"
        elif "No new enriched vendors" in last_text:
            m.agentwiki_status = "idle"
        else:
            m.agentwiki_status = "unknown"

    # Check backup status from the last log
    if main_logs:
        last_text = main_logs[-1].read_text(encoding="utf-8", errors="replace")
        if "Successfully updated cumulative master" in last_text:
            m.backup_status = "ok"
        elif "Backup failed" in last_text or "ERROR" in last_text.split("Phase 0")[0] if "Phase 0" in last_text else "":
            m.backup_status = "failed"
        else:
            m.backup_status = "ok"

    # Check backup file freshness
    try:
        master = BACKUP_DIR / "databases" / "vendors_master.db"
        if master.exists():
            age_hrs = (time.time() - master.stat().st_mtime) / 3600
            m.backup_last = f"{age_hrs:.1f} hours ago"
            if age_hrs > 6:
                m.backup_status = "stale"
        else:
            m.backup_last = "not found"
            m.backup_status = "missing"
    except Exception:
        m.backup_last = "check failed"

    # Scheduled task status (Windows-specific)
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f'$t = Get-ScheduledTaskInfo -TaskPath "{PIPELINE_TASK_PATH}" -TaskName "{PIPELINE_TASK_NAME}"; '
             f'$s = Get-ScheduledTask -TaskPath "{PIPELINE_TASK_PATH}" -TaskName "{PIPELINE_TASK_NAME}"; '
             '$s.State + "|" + $t.LastRunTime.ToString("yyyy-MM-dd HH:mm") + "|" + '
             '$t.NextRunTime.ToString("yyyy-MM-dd HH:mm") + "|" + $t.NumberOfMissedRuns'],
            capture_output=True, text=True, timeout=15
        )
        parts = result.stdout.strip().split("|")
        if len(parts) >= 4:
            m.scheduler_state = parts[0]
            m.scheduler_last_run = parts[1]
            m.scheduler_next_run = parts[2]
            m.scheduler_missed = int(parts[3]) if parts[3].isdigit() else 0
    except Exception:
        m.scheduler_state = "check_failed"

    # Compute health
    if m.scheduler_state not in ("Ready", "Running", ""):
        m.health = HealthStatus("critical", f"Scheduler state: {m.scheduler_state}")
    elif m.scheduler_missed > 0:
        m.health = HealthStatus("warning", f"{m.scheduler_missed} missed runs")
    elif m.total_errors_today > 10:
        m.health = HealthStatus("warning", f"{m.total_errors_today} errors today")
    elif m.runs_today == 0 and datetime.now().hour >= 4:
        m.health = HealthStatus("warning", "No pipeline runs found today")
    else:
        m.health = HealthStatus("healthy", f"{m.runs_today} runs, {m.total_enriched_today} enriched")

    return m


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Website health collector
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def collect_website() -> WebsiteMetrics:
    m = WebsiteMetrics(base_url=WEBSITE_BASE)
    total_ms = 0.0
    ok_count = 0

    for path, name in HEALTH_ENDPOINTS:
        check = EndpointCheck(path=path, name=name)
        url = WEBSITE_BASE.rstrip("/") + path
        try:
            start = time.monotonic()
            req = urllib.request.Request(url, headers={"User-Agent": "AVLpoint-HealthCheck/1.0"})
            resp = urllib.request.urlopen(req, timeout=10)
            elapsed = (time.monotonic() - start) * 1000
            check.status_code = resp.status
            check.response_ms = round(elapsed, 1)
            check.ok = 200 <= resp.status < 400
        except urllib.error.HTTPError as e:
            check.status_code = e.code
            check.response_ms = 0
            check.ok = False
        except Exception:
            check.status_code = 0
            check.response_ms = 0
            check.ok = False

        m.endpoints.append(check)
        if check.ok:
            ok_count += 1
            total_ms += check.response_ms

    m.all_ok = ok_count == len(HEALTH_ENDPOINTS)
    m.avg_response_ms = round(total_ms / max(ok_count, 1), 1)

    if ok_count == 0:
        m.health = HealthStatus("critical", "All endpoints unreachable")
    elif not m.all_ok:
        failed = [e.name for e in m.endpoints if not e.ok]
        m.health = HealthStatus("warning", f"Failing: {', '.join(failed)}")
    elif m.avg_response_ms > 3000:
        m.health = HealthStatus("warning", f"Slow avg: {m.avg_response_ms}ms")
    else:
        m.health = HealthStatus("healthy", f"All {len(HEALTH_ENDPOINTS)} endpoints OK, avg {m.avg_response_ms}ms")

    return m


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Historical comparison
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _load_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_history(entries: list[dict]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    # Keep last 90 days
    entries = entries[-90:]
    HISTORY_FILE.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")


def compute_deltas(db: DatabaseMetrics, pipeline: PipelineMetrics) -> DeltaMetrics:
    d = DeltaMetrics()
    history = _load_history()

    if history:
        prev = history[-1]
        d.has_previous = True
        d.previous_date = prev.get("date", "")
        d.us_total_delta = db.us_total - prev.get("us_total", db.us_total)
        d.intl_total_delta = db.intl_total - prev.get("intl_total", db.intl_total)
        d.combined_delta = d.us_total_delta + d.intl_total_delta
        d.us_verified_delta = db.us_verified - prev.get("us_verified", db.us_verified)
        d.runs_delta = pipeline.runs_today - prev.get("runs_today", 0)

    # Last 7 days for trend charts
    d.history_7d = history[-7:] if len(history) >= 1 else []

    return d


def save_todays_snapshot(report_date: str, db: DatabaseMetrics, pipeline: PipelineMetrics) -> None:
    history = _load_history()
    # Avoid duplicates
    history = [h for h in history if h.get("date") != report_date]
    history.append({
        "date": report_date,
        "us_total": db.us_total,
        "us_verified": db.us_verified,
        "intl_total": db.intl_total,
        "combined_total": db.combined_total,
        "us_enrichment_pct": db.us_enrichment_pct,
        "runs_today": pipeline.runs_today,
        "enriched_today": pipeline.total_enriched_today,
        "discovered_today": pipeline.total_discovered_today,
        "errors_today": pipeline.total_errors_today,
    })
    _save_history(history)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main collection orchestrator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def collect_all(report_date: str | None = None) -> ReportData:
    """
    Gather every metric for the given date (defaults to today).
    Returns a fully-populated ReportData object.
    """
    if report_date is None:
        report_date = datetime.now().strftime("%Y-%m-%d")

    data = ReportData(
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        report_date=report_date,
    )

    # 1. Database
    data.database = collect_database()

    # 2. Pipeline
    data.pipeline = collect_pipeline(report_date)

    # 3. Website
    data.website = collect_website()

    # 4. Deltas
    data.deltas = compute_deltas(data.database, data.pipeline)

    # 5. Save today's snapshot for future comparison
    save_todays_snapshot(report_date, data.database, data.pipeline)

    # 6. Compute overall health
    statuses = [data.database.health, data.pipeline.health, data.website.health]
    if any(s.status == "critical" for s in statuses):
        data.overall_health = HealthStatus("critical", "One or more systems critical")
    elif any(s.status == "warning" for s in statuses):
        data.overall_health = HealthStatus("warning", "Issues detected")
    else:
        data.overall_health = HealthStatus("healthy", "All systems operational")

    # 7. Issues & recommendations
    for s in statuses:
        if s.status != "healthy":
            data.issues.append(f"[{s.status.upper()}] {s.message}")

    if data.database.us_enrichment_pct < 25:
        data.recommendations.append("Consider increasing enrichment batch size to accelerate verified coverage.")
    if data.pipeline.agentwiki_status == "crash_unicode":
        data.recommendations.append("AgentWiki sync crashing on Unicode — fix PYTHONIOENCODING or safe_name usage.")
    if data.pipeline.backup_status in ("stale", "missing"):
        data.recommendations.append("Backup is stale or missing — verify external drive is connected.")
    if data.website.avg_response_ms > 2000:
        data.recommendations.append("Website response times are elevated — investigate server load.")
    if not data.issues:
        data.issues.append("No issues detected.")
    if not data.recommendations:
        data.recommendations.append("All systems nominal. No action required.")

    return data


if __name__ == "__main__":
    import pprint
    data = collect_all()
    print(f"Overall: {data.overall_health.status} — {data.overall_health.message}")
    print(f"DB: {data.database.combined_total:,} vendors ({data.database.us_enrichment_pct}% enriched)")
    print(f"Pipeline: {data.pipeline.runs_today} runs, {data.pipeline.total_enriched_today} enriched")
    print(f"Website: {data.website.health.message}")
    print(f"Delta: {data.deltas.combined_delta:+,} vendors since {data.deltas.previous_date or 'N/A'}")
