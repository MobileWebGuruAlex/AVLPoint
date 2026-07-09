import re

with open('http_client.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("if r.status in (401, 403):", "if r.status in (401, 402, 403):")

with open('http_client.py', 'w', encoding='utf-8') as f:
    f.write(code)
