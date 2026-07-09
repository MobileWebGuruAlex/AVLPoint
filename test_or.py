import asyncio
import os
from dotenv import load_dotenv
import aiohttp

load_dotenv()
key = os.getenv("OPENROUTER_API_KEY")
print("Key:", key[:10] if key else "None")

async def test():
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://avlpoint.com",
        "X-Title": "AVL Point"
    }
    payload = {
        "model": "google/gemini-2.5-flash",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    }
    async with aiohttp.ClientSession() as session:
        async with session.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers) as r:
            print(r.status)
            print(await r.text())

asyncio.run(test())
