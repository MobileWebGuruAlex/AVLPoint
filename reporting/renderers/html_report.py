"""
AVLpoint Daily Report — HTML Dashboard Renderer
Renders the Jinja2 template into a self-contained HTML file.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from reporting.collector import ReportData
from reporting.report_config import BRAND, REPORT_HOUR, REPORT_MINUTE

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def render_html(data: ReportData, output_dir: Path) -> Path:
    """Render the report to a self-contained HTML file. Returns the output path."""
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "report.html"

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=False,
    )
    template = env.get_template("report.html.j2")

    # Compute sparkline bounds for 7-day chart
    history = data.deltas.history_7d
    totals = [d.get("combined_total", 0) for d in history] if history else [0]
    spark_min = min(totals) if totals else 0
    spark_range = max(totals) - spark_min if totals else 1

    # Format the report date for display
    try:
        dt = datetime.strptime(data.report_date, "%Y-%m-%d")
        report_date_display = dt.strftime("%B %d, %Y")
    except ValueError:
        report_date_display = data.report_date

    report_time = f"{REPORT_HOUR:02d}:{REPORT_MINUTE:02d}"

    html = template.render(
        report_date=data.report_date,
        report_date_display=report_date_display,
        generated_at=data.generated_at,
        report_time=report_time,
        overall_health=data.overall_health,
        database=data.database,
        pipeline=data.pipeline,
        website=data.website,
        deltas=data.deltas,
        issues=data.issues,
        recommendations=data.recommendations,
        brand=BRAND,
        spark_min=spark_min,
        spark_range=spark_range,
    )

    out_path.write_text(html, encoding="utf-8")
    return out_path
