/**
 * Canonical audit logger. Every security-relevant or data-mutating action
 * lands in the admin_actions table with a typed entity reference, so the
 * /admin/audit page can answer "who did what to which record, when".
 *
 * Writes must never break the action they describe — failures are swallowed
 * after a console warning.
 */
import { db } from "./db";
import { v4 as uuid } from "uuid";

export type AuditEntityType =
  | "vendor"
  | "user"
  | "org"
  | "inspector"
  | "inspection"
  | "invitation"
  | "session"
  | "system";

export interface AuditEntry {
  /** "-" for unauthenticated events (e.g. failed logins). */
  actorId: string;
  actorEmail: string;
  /** Namespaced action, e.g. "vendor.sleep", "auth.login_failed". */
  action: string;
  entityType: AuditEntityType;
  entityId?: string | number | null;
  /** Human-readable label of the target (company name, email, …). */
  entityLabel?: string | null;
  details?: Record<string, unknown>;
}

export function logAudit(entry: AuditEntry): void {
  try {
    const isVendor = entry.entityType === "vendor";
    const numericId = isVendor ? Number(entry.entityId) : NaN;
    db.prepare(
      `INSERT INTO admin_actions
         (id, admin_user_id, admin_email, action_type,
          target_vendor_id, target_vendor_name, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      entry.actorId,
      entry.actorEmail,
      entry.action,
      Number.isFinite(numericId) ? numericId : null,
      isVendor ? entry.entityLabel ?? null : null,
      entry.entityType,
      entry.entityId != null ? String(entry.entityId) : null,
      JSON.stringify({
        ...(entry.details ?? {}),
        ...(entry.entityLabel && !isVendor ? { label: entry.entityLabel } : {}),
      })
    );
  } catch (err) {
    console.warn("[audit] failed to record", entry.action, err);
  }
}

export interface AuditRow {
  id: string;
  admin_user_id: string;
  admin_email: string;
  action_type: string;
  target_vendor_id: number | null;
  target_vendor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  details: string;
  created_at: string;
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  actionType?: string;
  entityType?: string;
  actorEmail?: string;
  entityId?: string;
}

export function queryAudit(q: AuditQuery): { rows: AuditRow[]; total: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q.actionType) { clauses.push("action_type = ?"); params.push(q.actionType); }
  if (q.entityType) { clauses.push("entity_type = ?"); params.push(q.entityType); }
  if (q.actorEmail) { clauses.push("admin_email LIKE ?"); params.push(`%${q.actorEmail}%`); }
  if (q.entityId) { clauses.push("entity_id = ?"); params.push(q.entityId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT count(*) AS n FROM admin_actions ${where}`).get(...params) as { n: number }).n;
  const page = Math.max(1, q.page ?? 1);
  const pageSize = q.pageSize ?? 40;
  const rows = db.prepare(
    `SELECT * FROM admin_actions ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize) as AuditRow[];
  return { rows, total };
}

/** Distinct action types present in the log (for the filter dropdown). */
export function auditActionTypes(): string[] {
  return (db.prepare("SELECT DISTINCT action_type AS t FROM admin_actions ORDER BY t").all() as { t: string }[])
    .map((r) => r.t);
}
