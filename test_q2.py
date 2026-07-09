import sqlite3

conn = sqlite3.connect('vendors.db')
q = '''
SELECT company_name, dynamic_priority_score, enterprise_suitability_score, country, website_url 
FROM vendors 
ORDER BY dynamic_priority_score DESC, completeness_status ASC 
LIMIT 10
'''
for r in conn.execute(q):
    print(r)
