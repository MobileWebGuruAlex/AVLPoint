import re

with open('enrichment.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove the headers definition from after Tier 1
code = re.sub(
    r'\n                headers = \{\n                    "Authorization".*?\n                    "X-Title": "AVL Point"\n                \}',
    '',
    code,
    flags=re.DOTALL
)

# And insert it right before Tier 1
headers_code = '''
                headers = {
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://avlpoint.com",
                    "X-Title": "AVL Point"
                }
'''
code = code.replace(
    '# --- TIER 1: Method B (Cheap Triage) & Method C (No-Spend Threshold) ---',
    headers_code + '\n                # --- TIER 1: Method B (Cheap Triage) & Method C (No-Spend Threshold) ---'
)

with open('enrichment.py', 'w', encoding='utf-8') as f:
    f.write(code)
