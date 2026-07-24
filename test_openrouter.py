import os, requests
from dotenv import load_dotenv
load_dotenv()
url = 'https://openrouter.ai/api/v1/chat/completions'
headers = {
    'Authorization': f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
    'Content-Type': 'application/json'
}
data = {
    'model': 'anthropic/claude-sonnet-4',
    'messages': [{'role': 'user', 'content': 'hello'}]
}
r = requests.post(url, headers=headers, json=data)
print("claude-sonnet-4:", r.status_code, r.text)

data['model'] = 'anthropic/claude-3.5-sonnet'
r2 = requests.post(url, headers=headers, json=data)
print("claude-3.5-sonnet:", r2.status_code, r2.text[:200])
