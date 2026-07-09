import re

with open('http_client.py', 'r', encoding='utf-8') as f:
    code = f.read()

# For post_json
code = code.replace(
    'if r.status >= 400:\n                            return None',
    'if r.status >= 400:\n                            text = await r.text()\n                            log.warning("HTTP %s on %s: %s", r.status, url, text)\n                            return None'
)

with open('http_client.py', 'w', encoding='utf-8') as f:
    f.write(code)
