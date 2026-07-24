import sqlite3
import datetime
import json

conn = sqlite3.connect('vendors.db')
c = conn.cursor()

metrics = {}

# Total current
c.execute('SELECT COUNT(*) FROM vendors')
metrics['current_total'] = c.fetchone()[0]

# Fully verified
c.execute("SELECT COUNT(*) FROM vendors WHERE completeness_status = 'verified'")
metrics['verified'] = c.fetchone()[0]

# Discovered / Incomplete
c.execute("SELECT COUNT(*) FROM vendors WHERE completeness_status IN ('discovery', 'incomplete')")
metrics['needs_enrichment'] = c.fetchone()[0]

# Failed extractions (enrichment_attempts >= 3)
c.execute('SELECT COUNT(*) FROM vendors WHERE enrichment_attempts >= 3')
metrics['failed'] = c.fetchone()[0]

# Enriched in last 12 hours
last_12h = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=12)).strftime('%Y-%m-%d %H:%M:%S')
c.execute("SELECT COUNT(*) FROM vendors WHERE last_updated >= ? AND completeness_status = 'verified'", (last_12h,))
metrics['enriched_12h'] = c.fetchone()[0]

# Top categories
c.execute('SELECT primary_business_type, COUNT(*) as c FROM vendors GROUP BY primary_business_type ORDER BY c DESC LIMIT 10')
metrics['top_categories'] = dict(c.fetchall())

# Top states
c.execute("SELECT state_province, COUNT(*) as c FROM vendors WHERE country='US' AND state_province IS NOT NULL GROUP BY state_province ORDER BY c DESC LIMIT 10")
metrics['top_states'] = dict(c.fetchall())

print(json.dumps(metrics, indent=2))
