import re
with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()
    match = re.search(r'def get_enrich_targets.*?(?=def |\Z)', code, re.DOTALL)
    if match:
        print(match.group(0))
