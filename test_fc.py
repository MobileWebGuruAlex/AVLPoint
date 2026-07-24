import aiohttp, asyncio, os
from dotenv import load_dotenv
load_dotenv()

async def test():
    async with aiohttp.ClientSession() as s:
        r = await s.post('https://api.firecrawl.dev/v2/search', 
            json={'query':'manufacturing company in Texas', 'limit':2}, 
            headers={'Authorization':'Bearer '+os.environ['FIRECRAWL_API_KEY'], 'Content-Type':'application/json'})
        data = await r.json()
        print(data)

asyncio.run(test())
