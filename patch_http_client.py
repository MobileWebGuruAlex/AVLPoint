import re

with open('http_client.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Make 401 and 403 fatal
replace_block = '''
                        if r.status in (401, 403):
                            text = await r.text()
                            log.error("FATAL HTTP %s on %s: %s", r.status, url, text)
                            raise RuntimeError(f"Fatal API Auth/Limit Error: HTTP {r.status} on {url}")
                        if r.status >= 400:
'''

code = code.replace(
    'if r.status >= 400:',
    replace_block
)

with open('http_client.py', 'w', encoding='utf-8') as f:
    f.write(code)
