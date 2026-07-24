import os, requests
from dotenv import load_dotenv
load_dotenv()
url = 'https://api.webit.live/api/v1/realtime/serp'
nimble_url = 'https://api.nimbleway.com/api/v1/search'
sdk_url = 'https://sdk.nimbleway.com/v1/search'
headers = {
    'Authorization': f"Bearer {os.getenv('NIMBLE_API_KEY')}",
    'Content-Type': 'application/json'
}
payload = {
    'query': 'ASME U-stamp pressure vessel fabrication in Texas',
    'focus': 'general',
    'searchDepth': 'lite',
    'max_results': 10
}
try:
    r = requests.post(sdk_url, headers=headers, json=payload, timeout=10)
    print("sdk URL Status:", r.status_code)
    print("Response:", r.text[:500])
except Exception as e:
    print("Error:", e)
try:
    r2 = requests.post(nimble_url, headers=headers, json=payload, timeout=10)
    print("nimble URL Status:", r2.status_code)
    print("Response:", r2.text[:500])
except Exception as e:
    print("Error:", e)
