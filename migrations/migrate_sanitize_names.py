"""One-time migration: sanitize all existing company names in the database.

Strips markdown formatting, HTML entities, and control characters from
company_name using the same _sanitize_name logic now applied on ingest.
Also fixes obviously wrong year_established values (e.g., 1788).
"""
import json
import re
import html
import sqlite3

DB = "vendors.db"


def sanitize_name(name: str) -> str:
    """Clean company name: strip markdown, HTML entities, control chars."""
    name = (name or "").strip()
    name = html.unescape(name)
    # Strip markdown image+link combos: [![alt](img_url)](link_url) -> alt
    name = re.sub(r'\[!\[([^\]]*)\]\([^)]+\)\]\([^)]+\)', r'\1', name)
    # Strip markdown images: ![alt](url) -> alt
    name = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', name)
    # Strip markdown links: [text](url) -> text
    name = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', name)
    # Strip markdown formatting chars
    name = re.sub(r'[*#_`~>]', '', name)
    # Remove control characters
    name = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', name)
    # Collapse whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    # Strip leading/trailing punctuation that shouldn't be in names
    name = name.strip(' ,-.')
    return name


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    # Pass 1: Sanitize company names
    rows = conn.execute("SELECT id, company_name FROM vendors").fetchall()
    name_fixes = 0
    for r in rows:
        old_name = r["company_name"]
        new_name = sanitize_name(old_name)
        if new_name != old_name and new_name:
            # Check if the cleaned name would collide with an existing record
            existing = conn.execute(
                "SELECT id FROM vendors WHERE company_name = ? AND id != ?",
                (new_name, r["id"]),
            ).fetchone()
            if existing:
                print(f"  SKIP id={r['id']} -> '{new_name}' (collides with id={existing['id']})")
                continue
            conn.execute(
                "UPDATE vendors SET company_name = ? WHERE id = ?",
                (new_name, r["id"]),
            )
            name_fixes += 1
            if name_fixes <= 20:
                print(f"  FIX id={r['id']}: '{old_name[:60]}...' -> '{new_name}'")

    # Pass 2: Fix obviously wrong year_established values
    year_rows = conn.execute(
        "SELECT id, year_established FROM vendors WHERE year_established IS NOT NULL AND year_established != ''"
    ).fetchall()
    year_fixes = 0
    for r in year_rows:
        year_str = r["year_established"]
        try:
            year = int(year_str)
            if year < 1800 or year > 2026:
                conn.execute(
                    "UPDATE vendors SET year_established = NULL WHERE id = ?",
                    (r["id"],),
                )
                year_fixes += 1
                if year_fixes <= 10:
                    print(f"  YEAR FIX id={r['id']}: '{year_str}' -> NULL")
        except ValueError:
            # Non-numeric year — clear it
            conn.execute(
                "UPDATE vendors SET year_established = NULL WHERE id = ?",
                (r["id"],),
            )
            year_fixes += 1

    # Pass 3: Clear 'Not specified' sentinel values (should be NULL)
    for field in ("facility_size_sqft", "contact_email", "contact_phone",
                  "headquarters_location", "year_established"):
        conn.execute(
            f"UPDATE vendors SET {field} = NULL WHERE {field} IN ('Not specified', 'N/A', 'n/a', 'None', 'none', '-', 'unknown')"
        )

    conn.commit()
    print(f"\nSanitized {name_fixes} company names")
    print(f"Fixed {year_fixes} bad year_established values")
    print("Cleared 'Not specified' sentinel values")
    conn.close()


if __name__ == "__main__":
    main()
