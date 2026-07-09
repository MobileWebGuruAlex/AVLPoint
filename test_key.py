import asyncio
import os
from dotenv import load_dotenv
import aiohttp

load_dotenv()
key = os.getenv("OPENROUTER_API_KEY")

async def test():
    headers = {
        "Authorization": f"Bearer {key}",
    }
    async with aiohttp.ClientSession() as session:
        async with session.get("https://openrouter.ai/api/v1/auth/key", headers=headers) as r:
            print("Status:", r.status)
            print("Response:", await r.text())

asyncio.run(test())
