import re

with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. VendorRecord
code = re.sub(
    r'(enterprise_suitability_score: int = 0\n    enterprise_rationale: Optional\[str\] = None)',
    r'\1\n    dynamic_priority_score: int = 0',
    code
)

# 2. SCHEMA
code = re.sub(
    r'(enterprise_suitability_score INTEGER DEFAULT 0,\n    enterprise_rationale TEXT,)',
    r'\1\n    dynamic_priority_score INTEGER DEFAULT 0,',
    code
)

# 3. MIGRATIONS
code = re.sub(
    r'("CREATE INDEX IF NOT EXISTS idx_vendors_enterprise_score ON vendors\(enterprise_suitability_score\)",)',
    r'\1\n    "ALTER TABLE vendors ADD COLUMN dynamic_priority_score INTEGER DEFAULT 0",\n    "CREATE INDEX IF NOT EXISTS idx_vendors_priority ON vendors(dynamic_priority_score DESC)",',
    code
)

# 4. INSERT_SQL columns
code = re.sub(
    r'(enterprise_suitability_score, enterprise_rationale,)',
    r'\1 dynamic_priority_score,',
    code
)

# 5. INSERT_SQL values (add 1 more '?')
code = re.sub(
    r'(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?)',
    r'\1,?',
    code
)

# 6. UPDATE_SQL
code = re.sub(
    r'(enterprise_rationale=COALESCE\(\?, vendors\.enterprise_rationale\),)',
    r'\1\n    dynamic_priority_score=COALESCE(?, vendors.dynamic_priority_score),',
    code
)

# 7. SCALAR_FIELDS
code = re.sub(
    r'("enterprise_suitability_score", "enterprise_rationale",)',
    r'\1 "dynamic_priority_score",',
    code
)

# 8. Add calculate_dynamic_priority logic and update _insert_row
logic = '''
def calculate_dynamic_priority(v: VendorRecord) -> int:
    score = 0
    if v.website_url: score += 50
    if v.contact_email: score += 20
    if v.contact_phone: score += 10
    
    country = (v.country or "").lower()
    if country in ("us", "usa", "united states", "united states of america"):
        score += 100
        
    if v.enterprise_suitability_score:
        score += (v.enterprise_suitability_score * 3) # Max 300
        
    certs = v.certifications_held or []
    if certs:
        score += (len(certs) * 50)
        
    if not v.website_url and not v.thomasnet_profile_url:
        score -= 500
        
    if v.completeness_status == "verified":
        score -= 1000
        
    return score

def assess_enterprise_score'''

code = code.replace("def assess_enterprise_score", logic)

# 9. _insert_row parameters
code = re.sub(
    r'(v\.enterprise_rationale, # 40\.2)',
    r'\1\n        v.dynamic_priority_score, # 40.3',
    code
)

# 10. _upsert_vendor parameter & calculate score
upsert_code = '''
        if v.enterprise_suitability_score == 0:
            v.enterprise_suitability_score = assess_enterprise_score(v)
            
        v.dynamic_priority_score = calculate_dynamic_priority(v)

        # Try to insert first (no-op if exists)'''
code = code.replace('''
        if v.enterprise_suitability_score == 0:
            v.enterprise_suitability_score = assess_enterprise_score(v)

        # Try to insert first (no-op if exists)''', upsert_code)
        
# 11. _upsert_vendor update params
code = re.sub(
    r'(v\.enterprise_rationale, # 39\.2)',
    r'\1\n            v.dynamic_priority_score, # 39.3',
    code
)

# 12. get_enrich_targets query modification
query_update = '''ORDER BY
                      dynamic_priority_score DESC,
                      enterprise_suitability_score DESC,
                      CASE completeness_status'''
code = code.replace('''ORDER BY
                      enterprise_suitability_score DESC,
                      CASE completeness_status''', query_update)

with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("db_async.py patched for dynamic_priority_score")
