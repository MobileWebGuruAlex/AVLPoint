"""Export the vendor DB to separate CSV/JSON files by completeness status.

Outputs:
  vendors_export_verified.csv   /  vendors_export_verified.json
  vendors_export_incomplete.csv /  vendors_export_incomplete.json
  vendors_export_all.csv        /  vendors_export_all.json  (combined)

Incomplete records are records that have a name + at least one identifier
but lack the (location + contact-channel) combo we treat as "verified".
They are kept indefinitely so customers can correct / fill them in later.
"""
import csv
import json
import os
import sqlite3
import sys


def _serialize_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    # Deserialize JSON-encoded list columns
    list_fields = (
        "certifications_held", "materials_handled", "key_personnel",
        "services", "capabilities", "welding_processes",
        "fabrication_capabilities", "industries_served", "memberships",
        "equipment_list", "geographic_service_areas", "images",
        "license_numbers", "registration_numbers",
    )
    for field in list_fields:
        raw = d.get(field)
        if isinstance(raw, str) and raw:
            try:
                d[field] = json.loads(raw)
            except Exception:
                d[field] = []
        elif raw is None:
            d[field] = []
    # Normalize null/missing fields so downstream consumers see explicit empties
    for key in list(d.keys()):
        if d[key] is None:
            if key in list_fields:
                d[key] = []
            else:
                d[key] = ""
    return d


def _write_csv(path: str, rows: list[dict]):
    if not rows:
        # Still create an empty file with headers for downstream tools
        rows = [{}]
    keys = list(rows[0].keys()) if rows else []
    with open(path, "w", newline="", encoding="utf-8") as f:
        if not keys:
            return
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for r in rows:
            # CSV can't store lists — serialize them as JSON strings
            row = {k: (json.dumps(v) if isinstance(v, list) else v) for k, v in r.items()}
            writer.writerow(row)


def _write_json(path: str, rows: list[dict]):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)


def export_data(db_path: str = "vendors.db", out_dir: str = "."):
    if not os.path.exists(db_path):
        print(f"No database at {db_path}. Nothing to export.")
        return
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vendors ORDER BY id ASC")
        rows = [_serialize_row(r) for r in cursor.fetchall()]
    if not rows:
        print("DB is empty.")
        return

    verified = [r for r in rows if r.get("completeness_status") == "verified"]
    incomplete = [r for r in rows if r.get("completeness_status") != "verified"]

    out = {
        "verified": verified,
        "incomplete": incomplete,
        "all": rows,
    }
    for name, batch in out.items():
        csv_path = os.path.join(out_dir, f"vendors_export_{name}.csv")
        json_path = os.path.join(out_dir, f"vendors_export_{name}.json")
        _write_csv(csv_path, batch)
        _write_json(json_path, batch)
        print(f"[OK] {name:10s} -> {len(batch):5d} records  ({csv_path}, {json_path})")

    # Print summary
    print()
    print(f"Total in DB     : {len(rows)}")
    print(f"  verified      : {len(verified)}")
    print(f"  incomplete    : {len(incomplete)}")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "vendors.db"
    export_data(db)
