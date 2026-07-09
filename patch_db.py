import re

with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add fields to VendorRecord
code = re.sub(
    r'(language_needs_approval: bool = False)',
    r'\1\n    enterprise_suitability_score: int = 0\n    enterprise_rationale: Optional[str] = None',
    code
)

# 2. Add to SCHEMA
code = re.sub(
    r'(language_needs_approval INTEGER DEFAULT 0,)',
    r'\1\n    enterprise_suitability_score INTEGER DEFAULT 0,\n    enterprise_rationale TEXT,',
    code
)

# 3. Add to MIGRATIONS
code = re.sub(
    r'("CREATE INDEX IF NOT EXISTS idx_vendors_country ON vendors\(country\)",)',
    r'\1\n    "ALTER TABLE vendors ADD COLUMN enterprise_suitability_score INTEGER DEFAULT 0",\n    "ALTER TABLE vendors ADD COLUMN enterprise_rationale TEXT",\n    "CREATE INDEX IF NOT EXISTS idx_vendors_enterprise_score ON vendors(enterprise_suitability_score)",',
    code
)

# 4. Add to INSERT_SQL columns
code = re.sub(
    r'(license_numbers, registration_numbers, language_needs_approval,)',
    r'\1\n    enterprise_suitability_score, enterprise_rationale,',
    code
)

# 5. Add to INSERT_SQL values (add 2 more '?')
code = re.sub(
    r'(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?)',
    r'\1,?,?',
    code
)

# 6. Add to UPDATE_SQL
code = re.sub(
    r'(language_needs_approval=COALESCE\(\?, vendors\.language_needs_approval\),)',
    r'\1\n    enterprise_suitability_score=COALESCE(?, vendors.enterprise_suitability_score),\n    enterprise_rationale=COALESCE(?, vendors.enterprise_rationale),',
    code
)

# 7. Add to SCALAR_FIELDS
code = re.sub(
    r'("contact_form_url", "language_needs_approval", "ai_summary",)',
    r'\1 "enterprise_suitability_score", "enterprise_rationale",',
    code
)

# 8. Update get_enrich_targets sorting
code = re.sub(
    r'(ORDER BY\s+CASE completeness_status)',
    r'ORDER BY\n                      enterprise_suitability_score DESC,\n                      CASE completeness_status',
    code
)

with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("db_async.py patched")
