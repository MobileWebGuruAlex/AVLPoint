"""
AVLpoint Daily Report — PDF Renderer
Converts the HTML dashboard to a paginated PDF using xhtml2pdf.
Falls back gracefully if xhtml2pdf is unavailable.
"""
from __future__ import annotations

import re
from pathlib import Path

from reporting.collector import ReportData


def _strip_unsupported_css(html: str) -> str:
    """Remove CSS features that xhtml2pdf cannot parse."""
    # Remove @import rules (Google Fonts)
    html = re.sub(r"@import\s+url\([^)]*\)\s*;", "", html)
    # Remove @keyframes blocks
    html = re.sub(r"@keyframes\s+\w+\s*\{[^}]*\{[^}]*\}[^}]*\}", "", html, flags=re.DOTALL)
    # Remove animation properties
    html = re.sub(r"animation\s*:[^;]+;", "", html)
    # Remove transition properties
    html = re.sub(r"transition\s*:[^;]+;", "", html)
    # Remove @media print blocks (we inject our own)
    html = re.sub(r"@media\s+print\s*\{[^}]*\{[^}]*\}[^}]*\}", "", html, flags=re.DOTALL)
    # Simplify font-family to system fonts (xhtml2pdf can't load Google Fonts)
    html = html.replace("'Space Grotesk', sans-serif", "Helvetica, sans-serif")
    html = html.replace("'Inter', system-ui, sans-serif", "Helvetica, sans-serif")
    html = html.replace("'JetBrains Mono', monospace", "Courier, monospace")
    return html


def render_pdf(data: ReportData, output_dir: Path, html_path: Path | None = None) -> Path | None:
    """
    Render the PDF from the HTML report.
    Requires the HTML file to already exist (call html_report.render_html first).
    Returns the PDF path, or None if xhtml2pdf isn't installed.
    """
    try:
        from xhtml2pdf import pisa
    except ImportError:
        print("[report] xhtml2pdf not installed -- skipping PDF generation.")
        print("[report] Install with: pip install xhtml2pdf")
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "report.pdf"

    if html_path is None:
        html_path = output_dir / "report.html"

    if not html_path.exists():
        print(f"[report] HTML file not found at {html_path} -- cannot generate PDF.")
        return None

    html_content = html_path.read_text(encoding="utf-8")

    # Strip CSS features xhtml2pdf cannot handle
    html_content = _strip_unsupported_css(html_content)

    # Inject print-friendly overrides
    pdf_overrides = """
    <style>
      @page {
        size: A4 portrait;
        margin: 1.5cm 1.5cm 2cm 1.5cm;
      }
      body {
        background: #070B12 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .container { padding: 0 !important; }
    </style>
    """
    html_content = html_content.replace("</head>", pdf_overrides + "</head>")

    with open(out_path, "wb") as pdf_file:
        status = pisa.CreatePDF(html_content, dest=pdf_file)

    if status.err:
        print(f"[report] PDF generation had {status.err} error(s) but file was created.")

    if out_path.exists() and out_path.stat().st_size > 0:
        return out_path
    return None
