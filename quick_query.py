import sqlite3
conn = sqlite3.connect('vendors.db')
c = conn.cursor()

# Get confidence levels
levels = c.execute('SELECT confidence_level, count(*) FROM vendors GROUP BY confidence_level').fetchall()
print("--- Confidence Levels ---")
for l, cnt in levels:
    print(f"  {l}: {cnt}")
    
# Get enterprise scores
enriched = c.execute('SELECT count(*) FROM vendors WHERE enterprise_suitability_score > 0').fetchone()[0]
print(f"\n--- Enterprise Enriched Vendors ---")
print(f"  Total with Enterprise Score > 0: {enriched}")

# Top 5 Vendors
print("\n--- Top 5 Enriched Vendors (by Priority Score) ---")
top5 = c.execute('SELECT company_name, dynamic_priority_score, enterprise_suitability_score, confidence_level, website_url FROM vendors ORDER BY dynamic_priority_score DESC LIMIT 5').fetchall()
for t in top5:
    print(f"  {t[0]} (Priority: {t[1]}, Enterprise Score: {t[2]}) - {t[3]}")
    if t[4]:
        print(f"    URL: {t[4]}")
