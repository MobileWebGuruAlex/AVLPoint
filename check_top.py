import sqlite3
c = sqlite3.connect('vendors.db')
q = '''
SELECT 
    CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 'US' ELSE 'INTL' END as region,
    enterprise_tier,
    dynamic_priority_score,
    enterprise_suitability_score,
    completeness_status,
    company_name
FROM vendors
WHERE 
    (website_url IS NOT NULL AND website_url != '')
    AND lifecycle_stage NOT IN ('fully_built', 'locked', 'disqualified', 'quarantined')
    AND enterprise_tier != 3
    AND (
        (ai_metadata_data IS NULL OR ai_metadata_data IN ('{}', '', '""'))
        OR (ai_metadata_data IS NOT NULL AND ai_metadata_data NOT LIKE '%inspection_and_qa_capabilities%')
    )
ORDER BY
    CASE enterprise_tier
        WHEN 1 THEN 1
        WHEN 2 THEN 2
        WHEN 0 THEN 3
        ELSE 9
    END ASC,
    dynamic_priority_score DESC,
    enterprise_suitability_score DESC,
    CASE completeness_status
        WHEN 'verified' THEN 0
        WHEN 'partial'  THEN 1
        WHEN 'inferred' THEN 2
        ELSE 3
    END ASC,
    last_updated ASC
LIMIT 50
'''
for i, row in enumerate(c.execute(q).fetchall()):
    print(f"{i}: {row}")
