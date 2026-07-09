import os
import sqlite3
import time
from datetime import datetime

def backup_database(db_path: str, backup_dir: str = "backups"):
    """
    Creates a timestamped backup of the database using SQLite's safe backup API.
    Verifies the integrity of the backup before keeping it.
    Keeps the last 10 backups per database to prevent disk bloat.
    """
    if not os.path.exists(db_path):
        print(f"[Backup] Source database not found: {db_path}")
        return

    os.makedirs(backup_dir, exist_ok=True)
    
    basename = os.path.basename(db_path)
    name_without_ext = os.path.splitext(basename)[0]
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"{name_without_ext}_{timestamp}.db")
    
    print(f"[Backup] Starting online backup of {db_path} to {backup_path}...")
    try:
        # Use sqlite3.Connection.backup() to safely copy the database even while it is being written to.
        with sqlite3.connect(db_path, timeout=60.0) as source:
            with sqlite3.connect(backup_path, timeout=60.0) as dest:
                # The backup API locks the DB momentarily page by page, perfectly safe for WAL
                source.backup(dest)
        
        # Verify Integrity
        print(f"[Backup] Backup complete. Verifying integrity of {backup_path}...")
        with sqlite3.connect(backup_path) as verify_conn:
            cursor = verify_conn.execute("PRAGMA integrity_check;")
            result = cursor.fetchone()
            if result and result[0] == "ok":
                print(f"[Backup] Integrity check PASSED for {backup_path}")
            else:
                print(f"[Backup] ERROR: Integrity check FAILED: {result}")
                os.remove(backup_path)
                return
        
        # Prune old backups (keep last 10 per database)
        backups = []
        for f in os.listdir(backup_dir):
            if f.startswith(f"{name_without_ext}_") and f.endswith(".db"):
                backups.append(os.path.join(backup_dir, f))
                
        backups.sort(key=os.path.getmtime)
        if len(backups) > 10:
            for old_backup in backups[:-10]:
                try:
                    os.remove(old_backup)
                    print(f"[Backup] Pruned old backup: {old_backup}")
                except OSError:
                    pass
                        
    except Exception as e:
        print(f"[Backup] Warning: Failed to backup database: {e}")
        if os.path.exists(backup_path):
            try:
                os.remove(backup_path)
            except Exception:
                pass

if __name__ == "__main__":
    dbs_to_backup = [f for f in os.listdir(".") if f.endswith(".db") and not f.startswith("test_")]
    if not dbs_to_backup:
        print("[Backup] No databases found to backup.")
    for db in dbs_to_backup:
        backup_database(db, "backups")
