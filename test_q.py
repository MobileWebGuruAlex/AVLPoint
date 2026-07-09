import sqlite3
import pandas as pd
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)

conn = sqlite3.connect('vendors.db')
q = '''
SELECT company_name, dynamic_priority_score, enterprise_suitability_score, country, website_url, contact_email 
FROM vendors 
ORDER BY dynamic_priority_score DESC, completeness_status ASC 
LIMIT 10
'''
print(pd.read_sql_query(q, conn))
