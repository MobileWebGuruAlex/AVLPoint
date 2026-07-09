import asyncio
import sqlite3
import os
import json
from dotenv import load_dotenv
from db_async import VendorRecord
from enrichment import enrich_batch
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
log = logging.getLogger("test_batch_mem")

class MockAsyncDB:
    def __init__(self):
        self.vendors = []
    async def put(self, vendor):
        self.vendors.append(vendor)
    async def touch_vendor(self, company_name):
        pass
    async def put_and_wait(self, vendor):
        print(f"\nCompany: {vendor.company_name}\nSynopsis: {vendor.ai_synopsis}\nImages: {vendor.representative_images}")
        return True

async def test_batch_mem():
    load_dotenv()
    
    conn = sqlite3.connect("avlpoint.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM vendors WHERE (ai_synopsis IS NULL OR representative_images = '[]' OR representative_images IS NULL) AND website_url IS NOT NULL AND website_url != '' LIMIT 10")
    rows = cursor.fetchall()
    conn.close()
    
    vendors_to_update = []
    for row in rows:
        d = dict(row)
        kwargs = {}
        for k in d:
            if k in VendorRecord.__dataclass_fields__ and k != 'id':
                val = d[k]
                if val and isinstance(val, str) and (val.startswith('[') or val.startswith('{')):
                    try:
                        val = json.loads(val)
                    except Exception:
                        pass
                kwargs[k] = val
        v = VendorRecord(**kwargs)
        vendors_to_update.append(v)
        
    db = MockAsyncDB()
    
    if vendors_to_update:
        updated = await enrich_batch(db, vendors_to_update, use_llm_fallback=True, batch_size=10)
        
    print("\n\n--- TEST BATCH RESULTS (IN-MEMORY) ---")
    for v in db.vendors:
        print(f"\nCompany: {v.company_name}")
        print(f"Synopsis: {v.ai_synopsis}")
        print(f"Images: {v.representative_images}")

if __name__ == "__main__":
    asyncio.run(test_batch_mem())
