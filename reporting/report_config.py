"""
AVLpoint Daily Executive Report — Configuration
All reporting settings in one place.
"""
import os
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

PROJECT_DIR = Path(r"C:\Projects\AVLpoint")
REPORTS_DIR = PROJECT_DIR / "reports"
HISTORY_FILE = REPORTS_DIR / "history.json"
VENV_PYTHON = PROJECT_DIR / "venv" / "Scripts" / "python.exe"

# Databases
VENDORS_DB = PROJECT_DIR / "vendors.db"
VENDORS_INTL_DB = PROJECT_DIR / "vendors_intl.db"
AVLPOINT_DB = PROJECT_DIR / "avlpoint.db"

# Logs
LOG_DIR = PROJECT_DIR / "logs"

# Backups
BACKUP_DIR = Path(os.environ.get("BACKUP_EXTERNAL_DIR", r"E:\backupavl"))

# Website health-check endpoints (relative to base)
WEBSITE_BASE = os.environ.get("REPORT_WEBSITE_URL", "http://localhost:3000")
HEALTH_ENDPOINTS = [
    ("/", "Homepage"),
    ("/search", "Vendor Search"),
    ("/pricing", "Pricing"),
    ("/about", "About"),
    ("/product", "Product"),
    ("/faq", "FAQ"),
    ("/login", "Login"),
    ("/signup", "Sign Up"),
]

# Scheduled-task name for pipeline
PIPELINE_TASK_PATH = r"\AVLpoint\\"
PIPELINE_TASK_NAME = "PipelineRun"

# ── Branding (from BRANDING.md) ──────────────────────────────────────
BRAND = {
    "name": "AVLpoint",
    "tagline": "AI-powered industrial vendor discovery",
    "bg": "#070B12",
    "surface": "#0D131D",
    "surface2": "#131B28",
    "fg": "#E6EDF6",
    "fg_secondary": "#94A3B8",
    "fg_muted": "#5C6B82",
    "arc": "#38C8FF",
    "arc_deep": "#4F7DFF",
    "ok": "#34D399",
    "warn": "#FBBF24",
    "danger": "#F87171",
    "line": "#1E293B",
    "font_display": "Space Grotesk",
    "font_body": "Inter",
    "font_mono": "JetBrains Mono",
}

# ── Email (disabled until SMTP is configured) ────────────────────────
SMTP_HOST = os.environ.get("REPORT_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("REPORT_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("REPORT_SMTP_USER", "")
SMTP_PASS = os.environ.get("REPORT_SMTP_PASS", "")
SMTP_FROM = os.environ.get("REPORT_SMTP_FROM", "reports@avlpoint.com")
EMAIL_RECIPIENTS = [
    r.strip()
    for r in os.environ.get("REPORT_EMAIL_RECIPIENTS", "").split(",")
    if r.strip()
]
EMAIL_ENABLED = bool(SMTP_HOST and SMTP_USER and EMAIL_RECIPIENTS)

# ── Schedule ─────────────────────────────────────────────────────────
REPORT_HOUR = int(os.environ.get("REPORT_HOUR", "7"))  # 7 AM local
REPORT_MINUTE = int(os.environ.get("REPORT_MINUTE", "0"))
