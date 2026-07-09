import re

with open('http_client.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("class FatalAPIError(Exception):\n    pass\n\n", "")
code = code.replace("from __future__ import annotations", "from __future__ import annotations\n\nclass FatalAPIError(Exception):\n    pass\n")

with open('http_client.py', 'w', encoding='utf-8') as f:
    f.write(code)
