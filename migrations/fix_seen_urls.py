"""Fix seen_urls table with missing columns."""
import sqlite3
conn = sqlite3.connect("vendors.db")
for m in [
    "ALTER TABLE seen_urls ADD COLUMN last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE seen_urls ADD COLUMN scrape_count INTEGER DEFAULT 1",
]:
    try:
        conn.execute(m)
        print(f"OK: {m}")
    except Exception as e:
        print(f"SKIP: {m} ({e})")
conn.commit()
conn.close()
print("Done")
