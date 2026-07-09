import re

with open('enrichment.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove firecrawl import
code = re.sub(r'try:\n    from firecrawl import FirecrawlApp.*?(?=log = logging)', '', code, flags=re.DOTALL)

# 2. Update enrich_batch signature
code = re.sub(
    r'async def enrich_batch\(nw, db: AsyncDB, vendors: list\[VendorRecord\], use_llm_fallback: bool = True, batch_size: int = 50\) -> int:',
    r'async def enrich_batch(db: AsyncDB, vendors: list[VendorRecord], use_llm_fallback: bool = True, batch_size: int = 50) -> int:',
    code
)

# 3. Remove PRE-TIER 2.5 Firecrawl Fallback completely
code = re.sub(
    r'    # PRE-TIER 2\.5: Firecrawl Fallback for missing contact info\n    if fc is not None:.*?(?=    # PRE-TIER 3: EPA ECHO Facility Search)',
    '',
    code,
    flags=re.DOTALL
)
code = re.sub(r'if fc is not None:.*?# PRE-TIER 3', '# PRE-TIER 3', code, flags=re.DOTALL) # double check

# 4. Inject Tier 1 (Method B & C) into process_llm
tier1_code = '''
                # --- TIER 1: Method B (Cheap Triage) & Method C (No-Spend Threshold) ---
                triage_payload = {
                    "model": "google/gemini-2.5-flash",
                    "messages": [
                        {"role": "system", "content": "You are a highly efficient industrial classifier. Evaluate this company website text and determine its enterprise manufacturing suitability. Return ONLY valid JSON: {\\"enterprise_suitability_score\\": <int 1-100>, \\"classification\\": \\"<string>\\", \\"rationale\\": \\"<string>\\"}."},
                        {"role": "user", "content": vendor_md[:30000]}
                    ],
                    "response_format": {"type": "json_object"}
                }
                
                try:
                    triage_resp = await http.post_json("https://openrouter.ai/api/v1/chat/completions", payload=triage_payload, headers=headers)
                    triage_content = triage_resp["choices"][0]["message"]["content"]
                    triage_json = json.loads(triage_content)
                    
                    score = triage_json.get("enterprise_suitability_score", 0)
                    first_url = list(_candidates(v))[0] if _candidates(v) else "unknown"
                    if first_url not in parsed_map:
                        parsed_map[first_url] = {}
                        
                    parsed_map[first_url]["enterprise_suitability_score"] = score
                    parsed_map[first_url]["enterprise_rationale"] = triage_json.get("rationale")
                    
                    if score < 50:
                        log.info("Tier 1 Skipped Tier 2 for %s (Score: %s). Rationale: %s", v.company_name, score, triage_json.get("rationale"))
                        return  # METHOD C: Abort expensive Tier 2 extraction
                        
                    log.info("Tier 1 Authorized Tier 2 for %s (Score: %s).", v.company_name, score)
                except Exception as e:
                    log.warning("Tier 1 Triage failed for %s: %s", v.company_name, e)
                    return # If triage fails, do not spend money on Tier 2.
                
                # --- TIER 2: Method B (Expensive Deep Extraction) ---
'''

# We need to insert this right after llm_text = vendor_md[:150000] and before system_prompt = ...
code = re.sub(
    r'(                llm_text = vendor_md\[:150000\].*?\n)(                system_prompt = )',
    r'\1' + tier1_code + r'\2',
    code
)

with open('enrichment.py', 'w', encoding='utf-8') as f:
    f.write(code)
