/**
 * Sleep / wake — the reversible alternative to deletion.
 *
 * Vendors: the pipeline owns the vendors table, so sleep state lives in a
 * website-owned overlay table (vendor_states). A 'sleeping' row hides the
 * vendor from every user-facing surface (search, profiles, similar,
 * featured, stats, facets, saved lists, APIs) via the AWAKE_SQL predicate;
 * deleting the row restores the vendor exactly as it was. No pipeline data
 * is touched, so waking is always lossless.
 *
 * Users and orgs are website-owned, so their sleep state is a `status`
 * column ('active' | 'disabled'/'sleeping') on their own row.
 *
 * Every transition is audit-logged with actor + reason.
 */
import { db } from "./db";
import { logAudit } from "./audit";
import { revokeAllSessionsForUser } from "./auth";

/**
 * SQL predicate that keeps a vendors query to awake vendors only.
 * `alias` must match the vendors table alias in the calling query.
 * Append with AND (or use as the only WHERE clause).
 */
export function awakeSql(alias = "v"): string {
  return `NOT EXISTS (SELECT 1 FROM vendor_states vst WHERE vst.vendor_id = ${alias}.id AND vst.state = 'sleeping')`;
}

export interface VendorStateRow {
  vendor_id: number;
  state: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export function getVendorState(vendorId: number): VendorStateRow | null {
  return (db.prepare("SELECT * FROM vendor_states WHERE vendor_id = ?").get(vendorId) as VendorStateRow | undefined) ?? null;
}

export function isVendorSleeping(vendorId: number): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM vendor_states WHERE vendor_id = ? AND state = 'sleeping'").get(vendorId)
  );
}

/** Map of vendor_id -> state for a set of ids (one query, for table views). */
export function getVendorStates(ids: number[]): Map<number, VendorStateRow> {
  const map = new Map<number, VendorStateRow>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT * FROM vendor_states WHERE vendor_id IN (${placeholders})`
  ).all(...ids) as VendorStateRow[];
  for (const r of rows) map.set(r.vendor_id, r);
  return map;
}

export function countSleepingVendors(): number {
  return (db.prepare("SELECT count(*) AS n FROM vendor_states WHERE state = 'sleeping'").get() as { n: number }).n;
}

export function sleepVendor(
  vendorId: number,
  reason: string,
  actor: { userId: string; email: string }
): { success: boolean; error?: string } {
  const vendor = db.prepare("SELECT id, company_name FROM vendors WHERE id = ?").get(vendorId) as
    { id: number; company_name: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  db.prepare(
    `INSERT INTO vendor_states (vendor_id, state, reason, changed_by, changed_at)
     VALUES (?, 'sleeping', ?, ?, datetime('now'))
     ON CONFLICT(vendor_id) DO UPDATE SET
       state='sleeping', reason=excluded.reason, changed_by=excluded.changed_by, changed_at=datetime('now')`
  ).run(vendorId, reason || null, actor.email);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "vendor.sleep",
    entityType: "vendor", entityId: vendorId, entityLabel: vendor.company_name,
    details: { reason },
  });
  return { success: true };
}

export function wakeVendor(
  vendorId: number,
  actor: { userId: string; email: string }
): { success: boolean; error?: string } {
  const vendor = db.prepare("SELECT id, company_name FROM vendors WHERE id = ?").get(vendorId) as
    { id: number; company_name: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  const res = db.prepare("DELETE FROM vendor_states WHERE vendor_id = ? AND state = 'sleeping'").run(vendorId);
  if (res.changes === 0) return { success: false, error: "Vendor is not sleeping." };

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "vendor.wake",
    entityType: "vendor", entityId: vendorId, entityLabel: vendor.company_name,
  });
  return { success: true };
}

/** Bulk sleep by explicit ids. Returns affected count. */
export function bulkSleepVendors(
  ids: number[],
  reason: string,
  actor: { userId: string; email: string }
): number {
  let affected = 0;
  const stmt = db.prepare(
    `INSERT INTO vendor_states (vendor_id, state, reason, changed_by, changed_at)
     VALUES (?, 'sleeping', ?, ?, datetime('now'))
     ON CONFLICT(vendor_id) DO UPDATE SET
       state='sleeping', reason=excluded.reason, changed_by=excluded.changed_by, changed_at=datetime('now')`
  );
  const exists = db.prepare("SELECT 1 FROM vendors WHERE id = ?");
  const tx = db.transaction(() => {
    for (const id of ids) {
      if (!exists.get(id)) continue;
      stmt.run(id, reason || null, actor.email);
      affected++;
    }
  });
  tx();
  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "vendor.bulk_sleep",
    entityType: "vendor", details: { reason, count: affected, ids_sample: ids.slice(0, 20) },
  });
  return affected;
}

export function bulkWakeVendors(ids: number[], actor: { userId: string; email: string }): number {
  const placeholders = ids.map(() => "?").join(",");
  if (!placeholders) return 0;
  const res = db.prepare(
    `DELETE FROM vendor_states WHERE state = 'sleeping' AND vendor_id IN (${placeholders})`
  ).run(...ids);
  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "vendor.bulk_wake",
    entityType: "vendor", details: { count: res.changes, ids_sample: ids.slice(0, 20) },
  });
  return res.changes;
}

/** All currently sleeping vendors (for the admin "Sleeping" view). */
export function listSleepingVendors(page = 1, pageSize = 50): {
  rows: (VendorStateRow & { company_name: string | null; country: string | null })[];
  total: number;
} {
  const total = countSleepingVendors();
  const rows = db.prepare(
    `SELECT s.*, ven.company_name, ven.country
     FROM vendor_states s LEFT JOIN vendors ven ON ven.id = s.vendor_id
     WHERE s.state = 'sleeping'
     ORDER BY s.changed_at DESC LIMIT ? OFFSET ?`
  ).all(pageSize, (Math.max(1, page) - 1) * pageSize) as (VendorStateRow & { company_name: string | null; country: string | null })[];
  return { rows, total };
}

/* ---------------- Users ---------------- */

export function setUserStatus(
  targetUserId: string,
  status: "active" | "disabled",
  actor: { userId: string; email: string },
  reason?: string
): { success: boolean; error?: string } {
  const user = db.prepare("SELECT id, email, role, status FROM users WHERE id = ?").get(targetUserId) as
    { id: string; email: string; role: string; status: string } | undefined;
  if (!user) return { success: false, error: "User not found." };
  if (user.id === actor.userId) return { success: false, error: "You cannot disable your own account." };

  // Never disable the last active super admin — that's a lockout.
  if (status === "disabled" && user.role === "super_admin") {
    const others = (db.prepare(
      "SELECT count(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active' AND id != ?"
    ).get(user.id) as { n: number }).n;
    if (others === 0) return { success: false, error: "Cannot disable the last active super admin." };
  }

  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, targetUserId);
  if (status === "disabled") revokeAllSessionsForUser(targetUserId);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: status === "disabled" ? "user.disable" : "user.enable",
    entityType: "user", entityId: targetUserId, entityLabel: user.email,
    details: reason ? { reason } : undefined,
  });
  return { success: true };
}

/* ---------------- Orgs (enterprise workspaces) ---------------- */

export function setOrgStatus(
  orgId: string,
  status: "active" | "sleeping",
  actor: { userId: string; email: string },
  reason?: string
): { success: boolean; error?: string } {
  const org = db.prepare("SELECT id, name, status FROM orgs WHERE id = ?").get(orgId) as
    { id: string; name: string; status: string } | undefined;
  if (!org) return { success: false, error: "Workspace not found." };

  db.prepare("UPDATE orgs SET status = ? WHERE id = ?").run(status, orgId);
  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: status === "sleeping" ? "org.sleep" : "org.wake",
    entityType: "org", entityId: orgId, entityLabel: org.name,
    details: reason ? { reason } : undefined,
  });
  return { success: true };
}
