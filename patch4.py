import re
with open('db_async.py', 'r', encoding='utf-8') as f:
    code = f.read()
code = code.replace('''    if v.completeness_status == "verified":
        score -= 1000''', '')
with open('db_async.py', 'w', encoding='utf-8') as f:
    f.write(code)
