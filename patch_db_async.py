import re

with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(
    r'    identity_data, business_data, capabilities_data, certifications_data,\n    relationships_data, products_data, experience_data, geographic_data,\n    business_info_data, digital_presence_data, brand_assets_data,\n    reputation_data, ai_metadata_data',
    '    ai_synopsis, representative_images',
    code
)

code = re.sub(
    r'\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?',
    '?,?',
    code, count=1
)

code = re.sub(
    r'    identity_data=\?,\n    business_data=\?,\n    capabilities_data=\?,\n    certifications_data=\?,\n    relationships_data=\?,\n    products_data=\?,\n    experience_data=\?,\n    geographic_data=\?,\n    business_info_data=\?,\n    digital_presence_data=\?,\n    brand_assets_data=\?,\n    reputation_data=\?,\n    ai_metadata_data=\?,',
    '    ai_synopsis=COALESCE(?, vendors.ai_synopsis),\n    representative_images=?,',
    code
)

code = code.replace(
    '"keywords", "search_tags", "use_cases", "vendor_categories",\n    "project_types", "technical_specialties", "partnerships_and_dealers",',
    '"keywords", "search_tags", "use_cases", "vendor_categories",\n    "project_types", "technical_specialties", "partnerships_and_dealers",\n    "representative_images",'
)

code = re.sub(
    r'DICT_FIELDS = \(\n    "identity_data", "business_data", "capabilities_data", "certifications_data",\n    "relationships_data", "products_data", "experience_data", "geographic_data",\n    "business_info_data", "digital_presence_data", "brand_assets_data",\n    "reputation_data", "ai_metadata_data"\n\)',
    'DICT_FIELDS = ()',
    code
)

code = code.replace(
    '"contact_form_url", "language_needs_approval", "ai_summary", "enterprise_suitability_score", "enterprise_rationale", "dynamic_priority_score",',
    '"contact_form_url", "language_needs_approval", "ai_summary", "enterprise_suitability_score", "enterprise_rationale", "dynamic_priority_score", "ai_synopsis",'
)

# Tuple replacements in _flush_batch
code = code.replace(
    '''            json.dumps(v.identity_data or {}),
            json.dumps(v.business_data or {}),
            json.dumps(v.capabilities_data or {}),
            json.dumps(v.certifications_data or {}),
            json.dumps(v.relationships_data or {}),
            json.dumps(v.products_data or {}),
            json.dumps(v.experience_data or {}),
            json.dumps(v.geographic_data or {}),
            json.dumps(v.business_info_data or {}),
            json.dumps(v.digital_presence_data or {}),
            json.dumps(v.brand_assets_data or {}),
            json.dumps(v.reputation_data or {}),
            json.dumps(v.ai_metadata_data or {}),''',
    '''            v.ai_synopsis,
            json.dumps(v.representative_images or []),'''
)

code = code.replace(
    '''            # And the UPDATE fields (all COALESCE/json merges)
            # SCALAR updates''',
    '''            v.ai_synopsis,
            json.dumps(v.representative_images or []),
            # And the UPDATE fields (all COALESCE/json merges)
            # SCALAR updates'''
)

with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
