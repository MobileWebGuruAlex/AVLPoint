"""One-time migration: clean up speculative cert labels from existing records.

Removes '(likely)' suffixed certs and 'TEMA-style'/'CEMA-style' labels that
were injected by the IQS source before we fixed it. These are NOT verified
certifications and should not appear in the data.
"""
import json
import sqlite3

DB = "vendors.db"

# Patterns to remove from certifications_held
SPECULATIVE = {
    "ASME (likely)", "AISC (likely)", "AWS (likely)",
    "API/UL (likely)", "API 650/620 (likely)",
    "TEMA-style", "CEMA-style",
}

def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, certifications_held FROM vendors").fetchall()
    updated = 0
    for r in rows:
        raw = r["certifications_held"]
        try:
            certs = json.loads(raw or "[]")
        except Exception:
            continue
        if not isinstance(certs, list):
            continue
        cleaned = [c for c in certs if c not in SPECULATIVE]
        if len(cleaned) != len(certs):
            conn.execute(
                "UPDATE vendors SET certifications_held = ? WHERE id = ?",
                (json.dumps(cleaned), r["id"]),
            )
            updated += 1
    conn.commit()
    print(f"Cleaned speculative certs from {updated} records.")
    conn.close()

if __name__ == "__main__":
    main()
