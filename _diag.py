import sqlite3
conn = sqlite3.connect('vendors.db')
rows = conn.execute("""
    SELECT company_name, dynamic_priority_score, last_updated, completeness_status, website_url
    FROM vendors 
    WHERE dynamic_priority_score >= 500 
    ORDER BY dynamic_priority_score DESC 
    LIMIT 15
""").fetchall()
for r in rows:
    print(f"{r[0][:55]:55} score={r[1]} updated={r[2]} status={r[3]} url={str(r[4])[:40]}")

print("\n--- Enrichment Timeline ---")
enriched = conn.execute("""
    SELECT last_updated, COUNT(*) 
    FROM vendors 
    WHERE last_updated IS NOT NULL 
    GROUP BY DATE(last_updated) 
    ORDER BY last_updated DESC LIMIT 10
""").fetchall()
for r in enriched:
    print(f"  {r[0]}: {r[1]} records updated")

print("\n--- ai_metadata_data distribution ---")
empty = conn.execute("SELECT COUNT(*) FROM vendors WHERE ai_metadata_data = '{}'").fetchone()[0]
null = conn.execute("SELECT COUNT(*) FROM vendors WHERE ai_metadata_data IS NULL").fetchone()[0]
other = conn.execute("SELECT COUNT(*) FROM vendors WHERE ai_metadata_data IS NOT NULL AND ai_metadata_data != '{}'").fetchone()[0]
print(f"  NULL: {null}")
print(f"  Empty '{{}}': {empty}")
print(f"  Populated: {other}")

print("\n--- run_enrichment_loop check ---")
# Check if the enrichment loop query can even find targets
targets = conn.execute("""
    SELECT COUNT(*) FROM (
        SELECT * FROM vendors
        ORDER BY dynamic_priority_score DESC, enterprise_suitability_score DESC
        LIMIT 5000
    ) WHERE (
        (website_url IS NOT NULL AND website_url != '')
        OR (thomasnet_profile_url IS NOT NULL AND thomasnet_profile_url != '')
    )
    AND (ai_metadata_data IS NULL OR ai_metadata_data = '{}' OR ai_metadata_data = '""')
    AND (last_updated IS NULL OR julianday('now') - julianday(last_updated) > 1)
""").fetchone()[0]
print(f"  Eligible targets within top 5000: {targets}")
