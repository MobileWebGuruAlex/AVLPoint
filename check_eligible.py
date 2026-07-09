import sqlite3
c = sqlite3.connect('vendors.db')
q = '''
SELECT 
    CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 'US' ELSE 'INTL' END as region,
    COUNT(*)
FROM vendors
WHERE 
    (website_url IS NOT NULL AND website_url != '')
    AND lifecycle_stage NOT IN ('fully_built', 'locked', 'disqualified', 'quarantined')
    AND enterprise_tier != 3
    AND (
        (ai_metadata_data IS NULL OR ai_metadata_data IN ('{}', '', '""'))
        OR (ai_metadata_data IS NOT NULL AND ai_metadata_data NOT LIKE '%inspection_and_qa_capabilities%')
    )
GROUP BY region
'''
print('Eligible targets:', c.execute(q).fetchall())
