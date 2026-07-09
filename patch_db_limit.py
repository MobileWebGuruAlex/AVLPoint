import re

with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the query in make_query
old_query = '''
                    SELECT * FROM vendors
                    WHERE (
                           (website_url IS NOT NULL AND website_url != '')
                        OR (thomasnet_profile_url IS NOT NULL AND thomasnet_profile_url != '')
                    )
                      AND (
                           contact_email IS NULL OR contact_email = ''
                        OR contact_phone IS NULL OR contact_phone = ''
                        OR website_url IS NULL OR website_url = ''
                        OR headquarters_location IS NULL OR headquarters_location = ''
                        OR street_address IS NULL OR street_address = ''
                        OR capabilities_data IS NULL OR capabilities_data = '{{}}'
                        OR ai_metadata_data IS NULL OR ai_metadata_data = '{{}}'
                      )
                      AND (last_updated IS NULL OR julianday('now') - julianday(last_updated) > 14)
                      AND (CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 1 ELSE 0 END) = {is_us}
                    ORDER BY
                      dynamic_priority_score DESC,
                      enterprise_suitability_score DESC,
                      CASE completeness_status
                        WHEN 'verified' THEN 0
                        WHEN 'partial' THEN 1
                        WHEN 'inferred' THEN 2
                        WHEN 'unconfirmed' THEN 3
                        ELSE 4
                      END ASC,
                      CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 0 ELSE 1 END,
                      company_name DESC,
                      last_updated ASC
                    LIMIT {q_limit} OFFSET {offset}
'''

new_query = '''
                    SELECT * FROM (
                        SELECT * FROM vendors
                        ORDER BY dynamic_priority_score DESC, enterprise_suitability_score DESC
                        LIMIT 2000
                    ) AS top_tier
                    WHERE (
                           (website_url IS NOT NULL AND website_url != '')
                        OR (thomasnet_profile_url IS NOT NULL AND thomasnet_profile_url != '')
                    )
                      AND (
                           contact_email IS NULL OR contact_email = ''
                        OR contact_phone IS NULL OR contact_phone = ''
                        OR website_url IS NULL OR website_url = ''
                        OR headquarters_location IS NULL OR headquarters_location = ''
                        OR street_address IS NULL OR street_address = ''
                        OR capabilities_data IS NULL OR capabilities_data = '{{}}'
                        OR ai_metadata_data IS NULL OR ai_metadata_data = '{{}}'
                      )
                      AND (last_updated IS NULL OR julianday('now') - julianday(last_updated) > 14)
                      AND (CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 1 ELSE 0 END) = {is_us}
                    ORDER BY
                      dynamic_priority_score DESC,
                      enterprise_suitability_score DESC,
                      CASE completeness_status
                        WHEN 'verified' THEN 0
                        WHEN 'partial' THEN 1
                        WHEN 'inferred' THEN 2
                        WHEN 'unconfirmed' THEN 3
                        ELSE 4
                      END ASC,
                      last_updated ASC
                    LIMIT {q_limit} OFFSET {offset}
'''

code = code.replace(old_query, new_query)

with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
