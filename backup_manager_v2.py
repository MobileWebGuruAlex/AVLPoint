import os
import sqlite3
import shutil
import time
import json
import urllib.request
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def send_webhook_alert(message, is_error=True):
    webhook_url = os.environ.get("BACKUP_WEBHOOK_URL")
    if not webhook_url:
        return
    
    color = 16711680 if is_error else 65280 # Red for error, Green for success
    title = "AVLpoint Backup Alert 🚨" if is_error else "AVLpoint Backup Success ✅"
    
    payload = {
        "embeds": [
            {
                "title": title,
                "description": message,
                "color": color,
                "timestamp": datetime.utcnow().isoformat()
            }
        ]
    }
    
    try:
        req = urllib.request.Request(webhook_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[Backup] Failed to send webhook alert: {e}")

def sync_directory(src_dir, dest_dir):
    """Incrementally copies only new or modified files from src_dir to dest_dir."""
    if not os.path.exists(src_dir):
        return
        
    os.makedirs(dest_dir, exist_ok=True)
    copied = 0
    for root, _, files in os.walk(src_dir):
        # Determine relative path from src_dir
        rel_path = os.path.relpath(root, src_dir)
        target_dir = os.path.join(dest_dir, rel_path) if rel_path != '.' else dest_dir
        os.makedirs(target_dir, exist_ok=True)
        
        for file in files:
            src_file = os.path.join(root, file)
            dest_file = os.path.join(target_dir, file)
            
            # Check if file exists and has same mtime/size. If not, copy it.
            if not os.path.exists(dest_file) or os.path.getmtime(src_file) > os.path.getmtime(dest_file) or os.path.getsize(src_file) != os.path.getsize(dest_file):
                shutil.copy2(src_file, dest_file)
                copied += 1
                
    if copied > 0:
        print(f"[Backup] Synced {copied} new/modified files to {dest_dir}.")

def backup_sqlite_db_incremental(source_path, dest_dir):
    """
    Performs a true incremental page-level merge into the external master DB.
    Implements A/B rotation for safety.
    """
    if not os.path.exists(source_path):
        return
        
    basename = os.path.basename(source_path)
    base_no_ext, ext = os.path.splitext(basename)
    
    master_db = os.path.join(dest_dir, f"{base_no_ext}_master{ext}")
    previous_db = os.path.join(dest_dir, f"{base_no_ext}_previous{ext}")
    
    # 1. A/B Rotation: Copy current master to previous (if master exists and is valid)
    if os.path.exists(master_db):
        print(f"[Backup] Rotating previous master for {basename}...")
        shutil.copy2(master_db, previous_db)
        
    print(f"[Backup] Starting incremental merge for {basename} -> {master_db}...")
    try:
        source = sqlite3.connect(source_path, timeout=60.0)
        dest = sqlite3.connect(master_db, timeout=60.0)
        
        # Incremental page backup
        source.backup(dest)
        
        source.close()
        dest.close()
                
        # 2. Verify integrity of the new master backup
        print(f"[Backup] Verifying integrity of {master_db}...")
        verify_conn = sqlite3.connect(master_db)
        cursor = verify_conn.execute("PRAGMA integrity_check;")
        result = cursor.fetchone()
        verify_conn.close()
        
        if not result or result[0] != "ok":
            raise Exception(f"Integrity check failed for {master_db}: {result}")
            
        print(f"[Backup] Successfully updated cumulative master: {master_db}")
    except Exception as e:
        print(f"[Backup] ERROR backing up {basename}: {e}")
        # If the master failed, we still have the _previous.db untouched.
        raise e

def create_cumulative_backup():
    external_dir = os.environ.get("BACKUP_EXTERNAL_DIR")
    if not external_dir:
        msg = "BACKUP_EXTERNAL_DIR is not configured in .env. Cumulative backup aborted."
        print(f"[Backup] {msg}")
        send_webhook_alert(msg, is_error=True)
        return
        
    databases_dir = os.path.join(external_dir, "databases")
    config_dir = os.path.join(external_dir, "config")
    logos_dir = os.path.join(external_dir, "logos")
    
    os.makedirs(databases_dir, exist_ok=True)
    os.makedirs(config_dir, exist_ok=True)
    os.makedirs(logos_dir, exist_ok=True)
    
    try:
        # 1. Backup databases (Incremental Merge)
        dbs_to_backup = [f for f in os.listdir(".") if f.endswith(".db") and not f.startswith("test_")]
        for db in dbs_to_backup:
            backup_sqlite_db_incremental(db, databases_dir)
            
        # 2. Copy static files (overwriting if newer)
        files_to_backup = [
            ".env",
            "failed_vendors.jsonl",
            "nimbleway_completed_queries.txt",
        ]
        for f in files_to_backup:
            if os.path.exists(f):
                shutil.copy2(f, os.path.join(config_dir, f))
                
        # 3. Incrementally sync logos directory
        sync_directory("logos", logos_dir)
        
        # Send success webhook
        send_webhook_alert("Successfully updated cumulative master backup on external drive.", is_error=False)
        
    except Exception as e:
        error_msg = f"Cumulative Backup failed: {str(e)}"
        print(f"[Backup] {error_msg}")
        send_webhook_alert(error_msg, is_error=True)
        raise e

if __name__ == "__main__":
    print(f"=== Starting Cumulative Backup at {datetime.now()} ===")
    create_cumulative_backup()
    print("=== Cumulative Backup Process Complete ===")
