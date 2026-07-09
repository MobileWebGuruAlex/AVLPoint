import os
import zipfile
import shutil
import argparse
import sys
from datetime import datetime

def check_pipeline_running():
    lock_file = ".pipeline.lock"
    if os.path.exists(lock_file):
        print(f"[Restore] WARNING: The pipeline appears to be running (found {lock_file}).")
        print("[Restore] Restoring while the pipeline is running can cause severe database corruption.")
        print("[Restore] Please stop the pipeline/Task Scheduler before proceeding.")
        return True
    return False

def extract_backup(zip_filepath):
    if not os.path.exists(zip_filepath):
        print(f"[Restore] ERROR: Backup archive not found: {zip_filepath}")
        return False
        
    print(f"\n[Restore] === Starting restoration from {zip_filepath} ===")
    
    # 1. Check if pipeline is running
    if check_pipeline_running():
        confirm = input("Are you absolutely sure you want to proceed? (y/N): ")
        if confirm.lower() != 'y':
            print("[Restore] Aborting restoration.")
            return False

    # 2. Safety first: Rename existing DBs so we don't accidentally destroy something recent
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safety_dir = f"restore_safety_backup_{timestamp}"
    os.makedirs(safety_dir, exist_ok=True)
    
    print(f"[Restore] Backing up current state to {safety_dir} before overwriting...")
    for item in os.listdir("."):
        if item.endswith(".db") or item in [".env", "failed_vendors.jsonl", "nimbleway_completed_queries.txt"]:
            try:
                shutil.move(item, os.path.join(safety_dir, item))
            except Exception as e:
                print(f"  Warning: could not move {item}: {e}")
                
    if os.path.exists("logos"):
        try:
             shutil.move("logos", os.path.join(safety_dir, "logos"))
        except Exception as e:
             print(f"  Warning: could not move logos/: {e}")

    # 3. Extract the zip
    print(f"[Restore] Extracting files from {zip_filepath}...")
    try:
        with zipfile.ZipFile(zip_filepath, 'r') as zipf:
            zipf.extractall(".")
        print(f"[Restore] SUCCESS: Restored {len(zipf.namelist())} files.")
        print("[Restore] The system state has been rolled back to the time of the backup.")
        return True
    except Exception as e:
        print(f"[Restore] FATAL ERROR during extraction: {e}")
        print(f"[Restore] Please recover from the safety backup folder: {safety_dir}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore an AVLpoint backup archive.")
    parser.add_argument("backup_file", help="Path to the .zip backup file")
    
    args = parser.parse_args()
    
    if not zipfile.is_zipfile(args.backup_file):
        print(f"ERROR: {args.backup_file} is not a valid zip file.")
        sys.exit(1)
        
    extract_backup(args.backup_file)
