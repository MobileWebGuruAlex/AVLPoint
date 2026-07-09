import asyncio
import sqlite3
import os
from dotenv import load_dotenv
from db_async import AsyncDB, VendorRecord
from enrichment import enrich_batch
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
log = logging.getLogger("backfill")

async def backfill_cards():
    load_dotenv()
    db = AsyncDB()
    await db.start()
    
    log.info("Querying for records needing AI Synopsis or Representative Images...")
    # Get vendors directly using aiosqlite
    vendors_to_update = []
    async with db.db.execute("SELECT * FROM vendors WHERE ai_synopsis IS NULL OR representative_images = '[]' LIMIT 10") as cursor:
        async for row in cursor:
            # We construct a dictionary dynamically to avoid field mismatch
            d = dict(row)
            # Create a VendorRecord using the dictionary
            # Strip fields not in VendorRecord
            kwargs = {}
            for k in d:
                if hasattr(VendorRecord, k) and k != 'id':
                    kwargs[k] = d[k]
                    if d[k] and isinstance(d[k], str) and (d[k].startswith('[') or d[k].startswith('{')):
                        try:
                            import json
                            kwargs[k] = json.loads(d[k])
                        except Exception:
                            pass
            v = VendorRecord(**kwargs)
            vendors_to_update.append(v)
            
    log.info(f"Found {len(vendors_to_update)} vendors to backfill in this batch.")
    
    if vendors_to_update:
        updated = await enrich_batch(db, vendors_to_update, use_llm_fallback=True, batch_size=50)
        log.info(f"Successfully updated {updated} vendors.")
        
    await db.stop()

if __name__ == "__main__":
    asyncio.run(backfill_cards())
