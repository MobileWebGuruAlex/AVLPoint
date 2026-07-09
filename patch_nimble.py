import re

with open('sources/nimbleway_search.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(r'# We\'ll use their general proxy / scraping endpoint if available, or just Firecrawl if this fails\.\n\s*', '', code)

with open('sources/nimbleway_search.py', 'w', encoding='utf-8') as f:
    f.write(code)
