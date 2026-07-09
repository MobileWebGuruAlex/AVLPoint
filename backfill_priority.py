import asyncio
import aiosqlite
import json
import logging
from db_async import AsyncDB, VendorRecord, calculate_dynamic_priority

logging.basicConfig(level=logging.INFO)
db_path = 'vendors.db'

async def backfill():
    logging.info('Adding dynamic_priority_score column if missing...')
    async with aiosqlite.connect(db_path) as conn:
        try:
            await conn.execute("ALTER TABLE vendors ADD COLUMN dynamic_priority_score INTEGER DEFAULT 0")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_vendors_priority ON vendors(dynamic_priority_score DESC)")
            await conn.commit()
            logging.info("Column added.")
        except aiosqlite.OperationalError as e:
            if 'duplicate column name' in str(e).lower():
                logging.info('Column already exists.')
            else:
                logging.error(f'Error adding column: {e}')
                
        logging.info("Fetching all vendors for recalculation...")
        conn.row_factory = aiosqlite.Row
        
        async with conn.execute("SELECT * FROM vendors") as cur:
            rows = await cur.fetchall()
            
        logging.info(f"Loaded {len(rows)} vendors. Recalculating scores...")
        
        updates = []
        for r in rows:
            d = dict(r)
            for f in ("certifications_held", "materials_handled", "key_personnel",
                        "services", "capabilities", "welding_processes",
                        "industries_served", "fabrication_capabilities",
                        "memberships", "registration_numbers", "social_profiles"):
                try:
                    d[f] = json.loads(d[f] or "[]")
                except Exception:
                    d[f] = []
                    
            v = VendorRecord(**{k: v for k, v in d.items() if k in VendorRecord.__annotations__})
            score = calculate_dynamic_priority(v)
            updates.append((score, v.company_name))
            
        logging.info("Applying updates in batches...")
        
        batch_size = 5000
        for i in range(0, len(updates), batch_size):
            batch = updates[i:i+batch_size]
            await conn.executemany("UPDATE vendors SET dynamic_priority_score = ? WHERE company_name = ?", batch)
            await conn.commit()
            logging.info(f"Processed {i + len(batch)} / {len(updates)}")
            
    logging.info("Backfill complete.")

if __name__ == '__main__':
    asyncio.run(backfill())
