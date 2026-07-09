import re

with open('.env', 'r', encoding='utf-8') as f:
    env_content = f.read()

env_content = re.sub(r'(?i)FIRECRAWL_API_KEY=.*?\n', '', env_content)

with open('.env', 'w', encoding='utf-8') as f:
    f.write(env_content)

with open('requirements.txt', 'r', encoding='utf-8') as f:
    req_content = f.read()

req_content = re.sub(r'(?i)firecrawl.*?\n', '', req_content)

with open('requirements.txt', 'w', encoding='utf-8') as f:
    f.write(req_content)
