import re

with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()

heuristic = '''
def assess_enterprise_score(v: VendorRecord) -> int:
    score = 0
    desc = (v.company_description or "").lower()
    if "fortune 500" in desc or "enterprise" in desc or "fortune 100" in desc:
        score += 30
    certs = [c.lower() for c in (v.certifications_held or [])]
    for c in certs:
        if "as9100" in c or "iatf" in c or "iso" in c or "nadcap" in c:
            score += 20
            break
    if v.facility_size_sqft:
        import re as _re
        nums = _re.findall(r'\d+', v.facility_size_sqft.replace(',', ''))
        if nums and int(nums[0]) > 50000:
            score += 15
    if (v.data_source or "").lower().startswith("thomasnet"):
        score += 10
    return min(100, score)

def _insert_row'''

code = code.replace("def _insert_row", heuristic)

# Update _insert_row return tuple
code = re.sub(
    r'(int\(v\.language_needs_approval\),\s*# 40)',
    r'\1\n        v.enterprise_suitability_score, # 40.1\n        v.enterprise_rationale, # 40.2',
    code
)

# Update _upsert_vendor params
code = re.sub(
    r'(int\(v\.language_needs_approval\), # 39)',
    r'\1\n            v.enterprise_suitability_score, # 39.1\n            v.enterprise_rationale, # 39.2',
    code
)

# In _upsert_vendor, we need to call the heuristic if score is 0
upsert_heuristic = '''
        if v.enterprise_suitability_score == 0:
            v.enterprise_suitability_score = assess_enterprise_score(v)

        # Try to insert first (no-op if exists)'''

code = code.replace("# Try to insert first (no-op if exists)", upsert_heuristic)

with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("db_async.py patched 2")
