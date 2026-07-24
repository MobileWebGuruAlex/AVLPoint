/**
 * Database backups (server-only).
 *
 * Uses SQLite's online backup API via better-sqlite3 — safe while the
 * discovery pipeline is writing (it snapshots pages incrementally and
 * produces a consistent copy including WAL content).
 *
 * Layout:
 *   backups/site/avlpoint-YYYYMMDD-HHMMSS.db   (primary, git-ignored)
 *   %BACKUP_EXTERNAL_DIR%\...                  (optional mirrored copy)
 *
 * RESTORE RUNBOOK (manual, deliberately not a web button):
 *   1. Stop the Next.js server AND the Python pipeline.
 *   2. In the project root: move vendors.db, vendors.db-wal, vendors.db-shm aside.
 *   3. Copy the chosen backup file to vendors.db.
 *   4. Restart. (WAL/SHM files regenerate; the moved-aside originals are your undo.)
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { logAudit } from "./audit";

const BACKUP_DIR = path.join(process.cwd(), "backups", "site");

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export function listBackups(): BackupInfo[] {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".db"))
      .map((name) => {
        const st = fs.statSync(path.join(BACKUP_DIR, name));
        return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export async function runBackup(actor: { userId: string; email: string }): Promise<{
  success: boolean;
  error?: string;
  file?: string;
  sizeBytes?: number;
  tookMs?: number;
  externalCopied?: boolean;
}> {
  const started = Date.now();
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const name = `avlpoint-${stamp}.db`;
    const dest = path.join(BACKUP_DIR, name);

    await db.backup(dest);
    const sizeBytes = fs.statSync(dest).size;

    let externalCopied = false;
    const externalDir = process.env.BACKUP_EXTERNAL_DIR;
    if (externalDir) {
      try {
        fs.mkdirSync(externalDir, { recursive: true });
        fs.copyFileSync(dest, path.join(externalDir, name));
        externalCopied = true;
      } catch (err) {
        console.warn("[backup] external copy failed", err);
      }
    }

    const tookMs = Date.now() - started;
    logAudit({
      actorId: actor.userId, actorEmail: actor.email, action: "backup.run",
      entityType: "system", details: { file: name, sizeBytes, tookMs, externalCopied },
    });
    return { success: true, file: name, sizeBytes, tookMs, externalCopied };
  } catch (err) {
    console.error("[backup] failed", err);
    return { success: false, error: "Backup failed — check server logs." };
  }
}

/* ---------------- Security posture (for /admin/settings) ---------------- */

export interface SecurityPosture {
  authSecretStrong: boolean;
  superAdmins: number;
  staffAccounts: number;
  activeSessions: number;
  failedLogins24h: number;
  sleepingVendors: number;
  disabledUsers: number;
  auditEvents: number;
}

export function getSecurityPosture(): SecurityPosture {
  const one = (sql: string) => {
    try { return (db.prepare(sql).get() as { n: number }).n; } catch { return 0; }
  };
  const secret = process.env.AUTH_SECRET ?? "";
  return {
    authSecretStrong: secret.length >= 32 && !secret.includes("change-me") && !secret.includes("rotate-me"),
    superAdmins: one("SELECT count(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active'"),
    staffAccounts: one("SELECT count(*) AS n FROM users WHERE role IN ('super_admin','admin','support')"),
    activeSessions: one("SELECT count(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > datetime('now')"),
    failedLogins24h: one("SELECT count(*) AS n FROM login_attempts WHERE success = 0 AND attempted_at > datetime('now', '-1 day')"),
    sleepingVendors: one("SELECT count(*) AS n FROM vendor_states WHERE state = 'sleeping'"),
    disabledUsers: one("SELECT count(*) AS n FROM users WHERE status = 'disabled'"),
    auditEvents: one("SELECT count(*) AS n FROM admin_actions"),
  };
}
