import os

exclude = ['venv', '.git', '__pycache__', 'logs', 'node_modules']
search_terms = ['firecrawl']

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in exclude]
    for file in files:
        if file.endswith(('.py', '.md', '.txt', '.env', '.ps1', '.bat')):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    for i, line in enumerate(f):
                        for term in search_terms:
                            if term in line.lower():
                                print(f'{filepath}:{i+1}: {line.strip()[:100]}')
                                break
            except Exception:
                pass
