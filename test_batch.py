import asyncio
import sqlite3
import os
import json
from dotenv import load_dotenv
from db_async import AsyncDB, VendorRecord
from enrichment import enrich_batch
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
log = logging.getLogger("test_batch")

async def test_batch():
    load_dotenv()
    db = AsyncDB()
    await db.open()
    
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
        
    log.info(f"Loaded {len(vendors_to_update)} vendors for test batch.")
    
    if vendors_to_update:
        updated = await enrich_batch(db, vendors_to_update, use_llm_fallback=True, batch_size=10)
        log.info(f"Successfully processed {updated} vendors.")
        
    # Wait for the DB queue to flush
    await asyncio.sleep(3)
    await db.close()
    
    # Print results to verify
    conn = sqlite3.connect("avlpoint.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    names = [v.company_name for v in vendors_to_update]
    placeholders = ",".join(["?"] * len(names))
    cursor.execute(f"SELECT company_name, ai_synopsis, representative_images FROM vendors WHERE company_name IN ({placeholders})", names)
    results = cursor.fetchall()
    conn.close()
    
    print("\n\n--- TEST BATCH RESULTS ---")
    for r in results:
        print(f"\nCompany: {r['company_name']}")
        print(f"Synopsis: {r['ai_synopsis']}")
        print(f"Images: {r['representative_images']}")

if __name__ == "__main__":
    asyncio.run(test_batch())
