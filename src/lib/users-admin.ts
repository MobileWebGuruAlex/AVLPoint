/**
 * User administration data layer (server-only).
 *
 * Role-change safety rules enforced here, not in the UI:
 *  - granting or revoking a STAFF role requires the actor to hold staff.manage
 *  - nobody may change their own role
 *  - the last active super_admin can be neither demoted nor disabled
 *  - managing (reset/disable/role) a staff account requires staff.manage
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { v4 as uuid } from "uuid";
import { db, type User } from "./db";
import { logAudit } from "./audit";
import { revokeAllSessionsForUser, countActiveSessions } from "./auth";
import { isStaffRole, normalizeRole, ALL_ROLES, type Role } from "./rbac";

export interface UserFilters {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface UserListRow {
  id: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
  active_sessions: number;
}

export function listUsers(filters: UserFilters): { users: UserListRow[]; total: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim()}%`;
    clauses.push("(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)");
    params.push(like, like, like);
  }
  if (filters.role) { clauses.push("u.role = ?"); params.push(filters.role); }
  if (filters.status) { clauses.push("u.status = ?"); params.push(filters.status); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT count(*) AS n FROM users u ${where}`).get(...params) as { n: number }).n;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 30;
  const users = db.prepare(
    `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.status, u.last_login_at, u.created_at,
       (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > datetime('now')) AS active_sessions
     FROM users u ${where}
     ORDER BY (CASE WHEN u.role IN ('super_admin','admin','support') THEN 0 ELSE 1 END), u.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize) as UserListRow[];
  return { users, total };
}

export function userStats(): { total: number; byRole: { role: string; count: number }[]; disabled: number } {
  const total = (db.prepare("SELECT count(*) AS n FROM users").get() as { n: number }).n;
  const byRole = db.prepare("SELECT role, count(*) AS count FROM users GROUP BY role ORDER BY count DESC")
    .all() as { role: string; count: number }[];
  const disabled = (db.prepare("SELECT count(*) AS n FROM users WHERE status = 'disabled'").get() as { n: number }).n;
  return { total, byRole, disabled };
}

export interface UserDetail extends UserListRow {
  vendor_id: number | null;
  must_change_password: number;
  org: { id: string; name: string; role: string } | null;
  owned_vendors: { id: number; company_name: string }[];
}

export function getUserDetail(id: string): UserDetail | null {
  const u = db.prepare(
    `SELECT id, email, role, first_name, last_name, status, last_login_at, created_at,
            vendor_id, must_change_password
     FROM users WHERE id = ?`
  ).get(id) as Omit<UserDetail, "org" | "owned_vendors" | "active_sessions"> | undefined;
  if (!u) return null;

  const org = (db.prepare(
    `SELECT o.id, o.name, m.role FROM orgs o JOIN org_members m ON m.org_id = o.id WHERE m.user_id = ? LIMIT 1`
  ).get(id) as { id: string; name: string; role: string } | undefined) ?? null;

  const owned = db.prepare(
    `SELECT v.id, v.company_name FROM vendor_owners vo JOIN vendors v ON v.id = vo.vendor_id WHERE vo.user_id = ? LIMIT 20`
  ).all(id) as { id: number; company_name: string }[];

  return { ...u, active_sessions: countActiveSessions(id), org, owned_vendors: owned };
}

const genTempPassword = () => crypto.randomBytes(12).toString("base64url");

export function createUser(
  input: { email: string; firstName?: string; role: string },
  actor: { userId: string; email: string; role: Role }
): { success: boolean; error?: string; tempPassword?: string } {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Enter a valid email address." };
  const role = normalizeRole(input.role);
  if (!ALL_ROLES.includes(role)) return { success: false, error: "Invalid role." };
  if (isStaffRole(role) && actor.role !== "super_admin") {
    return { success: false, error: "Only a super admin can create staff accounts." };
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return { success: false, error: "An account with this email already exists." };
  }

  const tempPassword = genTempPassword();
  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, first_name, status, must_change_password)
     VALUES (?, ?, ?, ?, ?, 'active', 1)`
  ).run(id, email, bcrypt.hashSync(tempPassword, 12), role, input.firstName?.trim() || null);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "user.create",
    entityType: "user", entityId: id, entityLabel: email, details: { role },
  });
  return { success: true, tempPassword };
}

export function setUserRole(
  targetId: string,
  newRole: string,
  actor: { userId: string; email: string; role: Role }
): { success: boolean; error?: string } {
  const target = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(targetId) as
    { id: string; email: string; role: string } | undefined;
  if (!target) return { success: false, error: "User not found." };
  if (target.id === actor.userId) return { success: false, error: "You cannot change your own role." };

  const role = normalizeRole(newRole);
  const touchesStaff = isStaffRole(role) || isStaffRole(target.role);
  if (touchesStaff && actor.role !== "super_admin") {
    return { success: false, error: "Only a super admin can grant or revoke staff roles." };
  }

  // Last-super-admin protection.
  if (target.role === "super_admin" && role !== "super_admin") {
    const others = (db.prepare(
      "SELECT count(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active' AND id != ?"
    ).get(target.id) as { n: number }).n;
    if (others === 0) return { success: false, error: "Cannot demote the last active super admin." };
  }

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetId);
  // Role change must reflect immediately — kill existing sessions so the
  // stale role hint inside issued JWTs can't linger either.
  if (touchesStaff) revokeAllSessionsForUser(targetId);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "user.role_change",
    entityType: "user", entityId: targetId, entityLabel: target.email,
    details: { from: target.role, to: role },
  });
  return { success: true };
}

export function resetUserPassword(
  targetId: string,
  actor: { userId: string; email: string; role: Role }
): { success: boolean; error?: string; tempPassword?: string } {
  const target = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(targetId) as
    { id: string; email: string; role: string } | undefined;
  if (!target) return { success: false, error: "User not found." };
  if (isStaffRole(target.role) && actor.role !== "super_admin" && target.id !== actor.userId) {
    return { success: false, error: "Only a super admin can reset a staff member's password." };
  }

  const tempPassword = genTempPassword();
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?"
  ).run(bcrypt.hashSync(tempPassword, 12), targetId);
  revokeAllSessionsForUser(targetId);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "user.password_reset",
    entityType: "user", entityId: targetId, entityLabel: target.email,
  });
  return { success: true, tempPassword };
}

/* ---------------- Invitations ---------------- */

export interface Invitation {
  token: string;
  email: string;
  role: string;
  org_id: string | null;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export function createInvitation(
  input: { email: string; role: string; orgId?: string | null },
  actor: { userId: string; email: string; role: Role }
): { success: boolean; error?: string; token?: string } {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Enter a valid email address." };
  const role = normalizeRole(input.role);
  if (isStaffRole(role) && actor.role !== "super_admin") {
    return { success: false, error: "Only a super admin can invite staff." };
  }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return { success: false, error: "An account with this email already exists." };
  }

  // Replace any previous unaccepted invite for the same email.
  db.prepare("DELETE FROM invitations WHERE email = ? AND accepted_at IS NULL").run(email);

  const token = crypto.randomBytes(24).toString("base64url");
  db.prepare(
    `INSERT INTO invitations (token, email, role, org_id, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))`
  ).run(token, email, role, input.orgId ?? null, actor.email);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "user.invite",
    entityType: "invitation", entityId: token.slice(0, 8), entityLabel: email, details: { role },
  });
  return { success: true, token };
}

export function listPendingInvitations(): Invitation[] {
  return db.prepare(
    `SELECT * FROM invitations WHERE accepted_at IS NULL AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 50`
  ).all() as Invitation[];
}

export function revokeInvitation(token: string, actor: { userId: string; email: string }): boolean {
  const inv = db.prepare("SELECT email FROM invitations WHERE token = ? AND accepted_at IS NULL").get(token) as
    { email: string } | undefined;
  const res = db.prepare("DELETE FROM invitations WHERE token = ? AND accepted_at IS NULL").run(token);
  if (res.changes > 0) {
    logAudit({
      actorId: actor.userId, actorEmail: actor.email, action: "invite.revoke",
      entityType: "invitation", entityId: token.slice(0, 8), entityLabel: inv?.email,
    });
  }
  return res.changes > 0;
}

export function getInvitation(token: string): Invitation | null {
  return (db.prepare("SELECT * FROM invitations WHERE token = ?").get(token) as Invitation | undefined) ?? null;
}

/** True when the invitation exists, is unused, and hasn't expired. */
export function isInvitationUsable(inv: Invitation | null): inv is Invitation {
  if (!inv || inv.accepted_at !== null) return false;
  return new Date(inv.expires_at.replace(" ", "T") + "Z").getTime() >= Date.now();
}

/** Accept an invitation: create the account, mark the token used. */
export function acceptInvitation(
  token: string,
  input: { firstName: string; password: string }
): { success: boolean; error?: string; user?: Pick<User, "id" | "email" | "first_name" | "role"> } {
  const inv = getInvitation(token);
  if (!inv) return { success: false, error: "This invitation link is invalid." };
  if (inv.accepted_at) return { success: false, error: "This invitation was already used." };
  const expired = db.prepare("SELECT 1 AS ok FROM invitations WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!expired) return { success: false, error: "This invitation has expired — ask for a new one." };
  if (input.password.length < 10) return { success: false, error: "Password must be at least 10 characters." };
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(inv.email)) {
    return { success: false, error: "An account with this email already exists — just sign in." };
  }

  const id = uuid();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, first_name, status, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'active', 0)`
    ).run(id, inv.email, bcrypt.hashSync(input.password, 12), inv.role, input.firstName.trim() || null);
    if (inv.org_id) {
      db.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, email, role) VALUES (?, ?, ?, 'member')")
        .run(inv.org_id, id, inv.email);
    }
    db.prepare("UPDATE invitations SET accepted_at = datetime('now') WHERE token = ?").run(token);
  });
  tx();

  logAudit({
    actorId: id, actorEmail: inv.email, action: "invite.accepted",
    entityType: "user", entityId: id, entityLabel: inv.email, details: { role: inv.role },
  });
  return {
    success: true,
    user: { id, email: inv.email, first_name: input.firstName.trim() || null, role: inv.role },
  };
}

/* ---------------- Notes ---------------- */

export interface AdminNote {
  id: string;
  entity_type: string;
  entity_id: string;
  note: string;
  author_email: string;
  created_at: string;
}

export function addNote(
  entityType: string, entityId: string, note: string,
  actor: { userId: string; email: string }
): void {
  db.prepare(
    "INSERT INTO admin_notes (id, entity_type, entity_id, note, author_email) VALUES (?, ?, ?, ?, ?)"
  ).run(uuid(), entityType, entityId, note.slice(0, 2000), actor.email);
}

export function listNotes(entityType: string, entityId: string): AdminNote[] {
  return db.prepare(
    "SELECT * FROM admin_notes WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(entityType, entityId) as AdminNote[];
}
