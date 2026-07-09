"""Idempotent schema migration for Phase 1 expanded fields."""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "vendors.db"

MIGRATIONS = [
    "ALTER TABLE vendors ADD COLUMN logo_url TEXT",
    "ALTER TABLE vendors ADD COLUMN street_address TEXT",
    "ALTER TABLE vendors ADD COLUMN city TEXT",
    "ALTER TABLE vendors ADD COLUMN state_province TEXT",
    "ALTER TABLE vendors ADD COLUMN country TEXT",
    "ALTER TABLE vendors ADD COLUMN zip_postal_code TEXT",
    "ALTER TABLE vendors ADD COLUMN company_description TEXT",
    "ALTER TABLE vendors ADD COLUMN services TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN capabilities TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN welding_processes TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN fabrication_capabilities TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN industries_served TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN memberships TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN equipment_list TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN shop_capacity TEXT",
    "ALTER TABLE vendors ADD COLUMN employee_count TEXT",
    "ALTER TABLE vendors ADD COLUMN geographic_service_areas TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN social_profiles TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN images TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN contact_form_url TEXT",
    "ALTER TABLE vendors ADD COLUMN license_numbers TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN registration_numbers TEXT DEFAULT '[]'",
    "CREATE INDEX IF NOT EXISTS idx_vendors_city ON vendors(city)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_state ON vendors(state_province)",
    """CREATE TABLE IF NOT EXISTS certifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER REFERENCES vendors(id),
        company_name TEXT NOT NULL,
        certification_type TEXT,
        certification_number TEXT,
        certification_status TEXT DEFAULT 'active',
        expiration_date TEXT,
        registry_id TEXT,
        issuing_organization TEXT,
        verification_url TEXT,
        metadata TEXT DEFAULT '{}',
        source TEXT,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_name, certification_type, COALESCE(certification_number, ''))
    )""",
    "CREATE INDEX IF NOT EXISTS idx_cert_vendor ON certifications(vendor_id)",
    "CREATE INDEX IF NOT EXISTS idx_cert_company ON certifications(company_name)",
    "CREATE INDEX IF NOT EXISTS idx_cert_type ON certifications(certification_type)",
]

conn = sqlite3.connect(DB)
ok = skip = 0
for m in MIGRATIONS:
    try:
        conn.execute(m)
        ok += 1
        print(f"OK:   {m[:70]}")
    except Exception as e:
        skip += 1
        print(f"SKIP: {m[:70]} ({e})")
conn.commit()
conn.close()
print(f"\nMigration complete: {ok} applied, {skip} skipped (already exist)")
