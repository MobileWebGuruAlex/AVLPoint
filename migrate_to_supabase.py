import os
import sqlite3
import json
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] - %(message)s")
log = logging.getLogger("migration")

def migrate_to_supabase():
    load_dotenv()
    
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in .env for migration.")
        return

    log.info("Connecting to Supabase...")
    supabase: Client = create_client(supabase_url, supabase_key)
    
    log.info("Connecting to local SQLite database...")
    if not os.path.exists("avlpoint.db"):
        log.error("avlpoint.db not found. Run this script in the project root.")
        return
        
    conn = sqlite3.connect("avlpoint.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Fetch vendors
    log.info("Fetching vendors from SQLite...")
    cursor.execute("SELECT * FROM vendors")
    vendors = [dict(row) for row in cursor.fetchall()]
    
    log.info(f"Found {len(vendors)} vendors. Beginning migration...")
    
    batch_size = 100
    for i in range(0, len(vendors), batch_size):
        batch = vendors[i:i + batch_size]
        
        # Clean data for Postgres JSONB insertion
        for v in batch:
            for k, val in list(v.items()):
                # Convert stringified JSON back to lists/dicts for Supabase
                if isinstance(val, str) and (val.startswith('[') or val.startswith('{')):
                    try:
                        v[k] = json.loads(val)
                    except json.JSONDecodeError:
                        pass
        
        try:
            response = supabase.table("vendors").upsert(batch, on_conflict="company_name").execute()
            log.info(f"Migrated batch {i} to {i + len(batch)}")
        except Exception as e:
            log.error(f"Error migrating batch {i}: {e}")
            
    conn.close()
    log.info("Migration to Supabase completed.")

if __name__ == "__main__":
    migrate_to_supabase()
