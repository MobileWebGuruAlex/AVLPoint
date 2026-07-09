import re

with open('http_client.py', 'r', encoding='utf-8') as f:
    code = f.read()

if "class FatalAPIError" not in code:
    code = "class FatalAPIError(Exception):\n    pass\n\n" + code

code = code.replace("raise RuntimeError(f\"Fatal API Auth/Limit Error: HTTP {r.status} on {url}\")", "raise FatalAPIError(f\"HTTP {r.status} on {url}\")")

with open('http_client.py', 'w', encoding='utf-8') as f:
    f.write(code)
