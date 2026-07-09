"""Create the certifications table."""
import sqlite3
conn = sqlite3.connect("vendors.db")
conn.execute("""
CREATE TABLE IF NOT EXISTS certifications (
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
    metadata TEXT,
    source TEXT,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_name, certification_type, certification_number)
)
""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_cert_vendor ON certifications(vendor_id)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_cert_company ON certifications(company_name)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_cert_type ON certifications(certification_type)")
conn.commit()
conn.close()
print("Certifications table created successfully")
