import sqlite3
import collections

c = sqlite3.connect('vendors.db')

print("--- Lifecycle Stages ---")
for row in c.execute("SELECT lifecycle_stage, COUNT(*) FROM vendors GROUP BY lifecycle_stage").fetchall():
    print(f"{row[0]}: {row[1]}")

print("\n--- Enrichment Attempts ---")
for row in c.execute("SELECT enrichment_attempts, COUNT(*) FROM vendors GROUP BY enrichment_attempts").fetchall():
    print(f"{row[0]}: {row[1]}")

print("\n--- Daily AI Synopsis Updates (Proxy for Enrichment) ---")
q = '''
SELECT DATE(last_updated), COUNT(*)
FROM vendors 
WHERE ai_synopsis IS NOT NULL AND ai_synopsis != ''
GROUP BY DATE(last_updated)
ORDER BY DATE(last_updated) DESC
LIMIT 7
'''
for row in c.execute(q).fetchall():
    print(f"{row[0]}: {row[1]}")

print("\n--- Daily Enrichment Attempts Updates (Proxy for Model Calls) ---")
q = '''
SELECT DATE(last_updated), SUM(enrichment_attempts)
FROM vendors
WHERE enrichment_attempts > 0
GROUP BY DATE(last_updated)
ORDER BY DATE(last_updated) DESC
LIMIT 7
'''
for row in c.execute(q).fetchall():
    print(f"{row[0]}: {row[1]}")
    
print("\n--- Disqualified / Locked / Fully Built count ---")
for row in c.execute("SELECT lifecycle_stage, COUNT(*) FROM vendors WHERE lifecycle_stage IN ('fully_built', 'locked', 'disqualified', 'quarantined') GROUP BY lifecycle_stage").fetchall():
    print(f"{row[0]}: {row[1]}")
