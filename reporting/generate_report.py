"""
AVLpoint Daily Executive Report — Main Entry Point

Usage:
    python -m reporting.generate_report                  # Full run (all formats)
    python -m reporting.generate_report --no-email       # Skip email
    python -m reporting.generate_report --format html    # Single format
    python -m reporting.generate_report --date 2026-07-07   # Specific date
"""
from __future__ import annotations

import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path

# Ensure project root is on path for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from reporting.report_config import REPORTS_DIR
from reporting.collector import collect_all


def setup_logging(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file = output_dir / "report_generation.log"
    # Force UTF-8 on the console stream so Unicode in log messages doesn't crash
    import io
    stdout_handler = logging.StreamHandler(
        io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        if hasattr(sys.stdout, "buffer") else sys.stdout
    )
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(str(log_file), encoding="utf-8"),
            stdout_handler,
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="AVLpoint Daily Executive Report Generator")
    parser.add_argument("--date", type=str, default=None, help="Report date (YYYY-MM-DD). Defaults to today.")
    parser.add_argument("--format", type=str, default="all", choices=["all", "html", "pdf", "pptx", "email"], help="Output format.")
    parser.add_argument("--no-email", action="store_true", help="Skip email delivery even if configured.")
    args = parser.parse_args()

    report_date = args.date or datetime.now().strftime("%Y-%m-%d")
    output_dir = REPORTS_DIR / report_date

    setup_logging(output_dir)
    log = logging.getLogger("report")

    log.info("=" * 60)
    log.info(f"AVLpoint Daily Report — {report_date}")
    log.info("=" * 60)

    # ── Step 1: Collect data ──
    log.info("Step 1: Collecting data from all sources...")
    try:
        data = collect_all(report_date)
        log.info(f"  Overall health: {data.overall_health.status} — {data.overall_health.message}")
        log.info(f"  Database: {data.database.combined_total:,} vendors")
        log.info(f"  Pipeline: {data.pipeline.runs_today} runs, {data.pipeline.total_enriched_today} enriched")
        log.info(f"  Website: {data.website.health.message}")
    except Exception as e:
        log.error(f"  Data collection failed: {e}", exc_info=True)
        sys.exit(1)

    generated = []

    # ── Step 2: HTML ──
    if args.format in ("all", "html"):
        log.info("Step 2: Generating HTML dashboard...")
        try:
            from reporting.renderers.html_report import render_html
            html_path = render_html(data, output_dir)
            log.info(f"  [OK] HTML: {html_path}")
            generated.append(("HTML", html_path))
        except Exception as e:
            log.error(f"  [FAIL] HTML generation failed: {e}", exc_info=True)
            html_path = None
    else:
        html_path = None

    # ── Step 3: PDF ──
    if args.format in ("all", "pdf"):
        log.info("Step 3: Generating PDF...")
        try:
            from reporting.renderers.pdf_report import render_pdf
            # Ensure HTML exists first (PDF is rendered from it)
            if html_path is None:
                from reporting.renderers.html_report import render_html
                html_path = render_html(data, output_dir)
            pdf_path = render_pdf(data, output_dir, html_path)
            if pdf_path:
                log.info(f"  [OK] PDF: {pdf_path}")
                generated.append(("PDF", pdf_path))
            else:
                log.warning("  [SKIP] PDF skipped (xhtml2pdf not installed)")
                pdf_path = None
        except Exception as e:
            log.error(f"  [FAIL] PDF generation failed: {e}", exc_info=True)
            pdf_path = None
    else:
        pdf_path = None

    # ── Step 4: PPTX ──
    if args.format in ("all", "pptx"):
        log.info("Step 4: Generating PowerPoint...")
        try:
            from reporting.renderers.pptx_report import render_pptx
            pptx_path = render_pptx(data, output_dir)
            if pptx_path:
                log.info(f"  [OK] PPTX: {pptx_path}")
                generated.append(("PPTX", pptx_path))
            else:
                log.warning("  [SKIP] PPTX skipped (python-pptx not installed)")
        except Exception as e:
            log.error(f"  [FAIL] PPTX generation failed: {e}", exc_info=True)

    # ── Step 5: Email ──
    if args.format in ("all", "email") and not args.no_email:
        log.info("Step 5: Generating email summary...")
        try:
            from reporting.renderers.email_report import render_email
            email_path = render_email(data, output_dir, pdf_path)
            log.info(f"  ✓ Email preview: {email_path}")
            generated.append(("Email", email_path))
        except Exception as e:
            log.error(f"  ✗ Email generation failed: {e}", exc_info=True)
    elif args.no_email:
        log.info("Step 5: Email skipped (--no-email flag)")

    # ── Summary ──
    log.info("-" * 60)
    log.info(f"Report complete. {len(generated)} output(s) generated:")
    for fmt, path in generated:
        log.info(f"  {fmt}: {path}")
    log.info(f"Output directory: {output_dir}")
    log.info("=" * 60)

    # Print summary to stdout for pipeline integration
    print(f"\n{'='*60}")
    print(f"AVLpoint Daily Report — {report_date}")
    print(f"Status: {data.overall_health.status.upper()}")
    print(f"Outputs: {output_dir}")
    for fmt, path in generated:
        print(f"  {fmt}: {path.name}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
