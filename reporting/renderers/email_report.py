"""
AVLpoint Daily Report — Email Renderer & Sender
Generates a concise HTML email and sends it via SMTP.
Disabled until SMTP credentials are configured in .env.
"""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from datetime import datetime
from pathlib import Path

from reporting.collector import ReportData
from reporting.report_config import (
    BRAND, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
    SMTP_FROM, EMAIL_RECIPIENTS, EMAIL_ENABLED,
)


def _build_email_html(data: ReportData) -> str:
    """Build a concise inline-styled HTML email body."""
    health_colors = {"healthy": "#34D399", "warning": "#FBBF24", "critical": "#F87171"}
    health_labels = {"healthy": "🟢 All Systems Operational", "warning": "🟡 Issues Detected", "critical": "🔴 Critical"}
    h_color = health_colors.get(data.overall_health.status, "#94A3B8")
    h_label = health_labels.get(data.overall_health.status, "Unknown")

    try:
        dt = datetime.strptime(data.report_date, "%Y-%m-%d")
        date_display = dt.strftime("%B %d, %Y")
    except ValueError:
        date_display = data.report_date

    delta_str = ""
    if data.deltas.has_previous:
        delta_str = f'<span style="color:#34D399;font-family:Consolas,monospace;font-size:13px">{data.deltas.combined_delta:+,} since {data.deltas.previous_date}</span>'

    issues_html = ""
    for issue in data.issues[:3]:
        icon = "🔴" if "CRITICAL" in issue else ("🟡" if "WARNING" in issue else "🟢")
        issues_html += f'<tr><td style="padding:6px 12px;font-size:13px;color:#E6EDF6;border-bottom:1px solid #1E293B">{icon} {issue}</td></tr>'

    return f"""
    <div style="max-width:600px;margin:0 auto;background:#070B12;border-radius:16px;overflow:hidden;font-family:Inter,Arial,sans-serif">
      <!-- Header -->
      <div style="padding:28px 32px;border-bottom:1px solid #1E293B">
        <div style="font-size:24px;font-weight:700;color:#E6EDF6">AVL<span style="color:#38C8FF">point</span></div>
        <div style="font-size:12px;color:#5C6B82;margin-top:4px">Daily Executive Report · {date_display}</div>
      </div>

      <!-- Health Banner -->
      <div style="padding:20px 32px;background:rgba({','.join(str(int(h_color.lstrip('#')[i:i+2],16)) for i in (0,2,4))},0.08)">
        <div style="font-size:18px;font-weight:600;color:{h_color}">{h_label}</div>
        <div style="font-size:13px;color:#94A3B8;margin-top:4px">{data.overall_health.message}</div>
      </div>

      <!-- KPI Grid -->
      <div style="padding:24px 32px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:16px;text-align:center;border:1px solid #1E293B;border-radius:8px">
              <div style="font-family:Consolas,monospace;font-size:28px;font-weight:700;color:#E6EDF6">{data.database.combined_total:,}</div>
              <div style="font-size:11px;color:#5C6B82;text-transform:uppercase;margin-top:4px">Total Vendors</div>
              {f'<div style="margin-top:4px">{delta_str}</div>' if delta_str else ''}
            </td>
            <td style="padding:16px;text-align:center;border:1px solid #1E293B">
              <div style="font-family:Consolas,monospace;font-size:28px;font-weight:700;color:#E6EDF6">{data.database.us_verified:,}</div>
              <div style="font-size:11px;color:#5C6B82;text-transform:uppercase;margin-top:4px">Verified</div>
            </td>
            <td style="padding:16px;text-align:center;border:1px solid #1E293B">
              <div style="font-family:Consolas,monospace;font-size:28px;font-weight:700;color:#E6EDF6">{data.pipeline.runs_today}</div>
              <div style="font-size:11px;color:#5C6B82;text-transform:uppercase;margin-top:4px">Runs Today</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Quick Metrics -->
      <div style="padding:0 32px 24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;font-size:13px;color:#94A3B8;border-bottom:1px solid #1E293B">Enriched today</td>
              <td style="padding:8px 0;font-family:Consolas,monospace;font-size:13px;color:#E6EDF6;text-align:right;border-bottom:1px solid #1E293B">{data.pipeline.total_enriched_today:,}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#94A3B8;border-bottom:1px solid #1E293B">Avg response time</td>
              <td style="padding:8px 0;font-family:Consolas,monospace;font-size:13px;color:#E6EDF6;text-align:right;border-bottom:1px solid #1E293B">{data.website.avg_response_ms:.0f}ms</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#94A3B8;border-bottom:1px solid #1E293B">Enrichment rate</td>
              <td style="padding:8px 0;font-family:Consolas,monospace;font-size:13px;color:#E6EDF6;text-align:right;border-bottom:1px solid #1E293B">{data.database.us_enrichment_pct}%</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#94A3B8">Backup status</td>
              <td style="padding:8px 0;font-family:Consolas,monospace;font-size:13px;color:{'#34D399' if data.pipeline.backup_status == 'ok' else '#FBBF24'};text-align:right">{data.pipeline.backup_status or 'N/A'}</td></tr>
        </table>
      </div>

      <!-- Issues -->
      {f'''<div style="padding:0 32px 24px">
        <div style="font-size:11px;font-weight:600;color:#5C6B82;text-transform:uppercase;margin-bottom:8px">Active Issues</div>
        <table style="width:100%;border-collapse:collapse;background:#0D131D;border-radius:8px;overflow:hidden">
          {issues_html}
        </table>
      </div>''' if issues_html else ''}

      <!-- Footer -->
      <div style="padding:20px 32px;border-top:1px solid #1E293B;text-align:center">
        <div style="font-size:11px;color:#5C6B82">Full report attached as PDF · <a href="https://avlpoint.com" style="color:#38C8FF;text-decoration:none">avlpoint.com</a></div>
      </div>
    </div>
    """


def render_email(data: ReportData, output_dir: Path, pdf_path: Path | None = None) -> Path:
    """
    Generate the email HTML and save it. Optionally send it via SMTP.
    Always saves the email body to disk. Only sends if SMTP is configured.
    Returns the path to the saved email HTML.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    email_html = _build_email_html(data)

    # Save email body for reference
    email_path = output_dir / "email_preview.html"
    email_path.write_text(email_html, encoding="utf-8")

    if not EMAIL_ENABLED:
        print("[report] Email delivery disabled (no SMTP configured). Email preview saved.")
        return email_path

    # Build email
    try:
        dt = datetime.strptime(data.report_date, "%Y-%m-%d")
        date_short = dt.strftime("%b %d")
    except ValueError:
        date_short = data.report_date

    health_icons = {"healthy": "🟢", "warning": "🟡", "critical": "🔴"}
    health_labels = {"healthy": "All Systems Healthy", "warning": "Issues Detected", "critical": "Critical"}
    subject = f"AVLpoint Daily Report — {date_short} · {health_icons.get(data.overall_health.status, '')} {health_labels.get(data.overall_health.status, 'Status Unknown')}"

    msg = MIMEMultipart("mixed")
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(EMAIL_RECIPIENTS)
    msg["Subject"] = subject

    msg.attach(MIMEText(email_html, "html", "utf-8"))

    # Attach PDF if available
    if pdf_path and pdf_path.exists():
        with open(pdf_path, "rb") as f:
            att = MIMEApplication(f.read(), _subtype="pdf")
            att.add_header("Content-Disposition", "attachment", filename=f"AVLpoint_Report_{data.report_date}.pdf")
            msg.attach(att)

    # Send
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        print(f"[report] Email sent to {len(EMAIL_RECIPIENTS)} recipient(s).")
    except Exception as e:
        print(f"[report] Email send failed: {e}")

    return email_path
