/**
 * Session management — server-backed, revocable sessions.
 *
 * The httpOnly cookie carries a short signed JWT whose only load-bearing
 * claims are `sub` (user id) and `jti` (session row id). On every request,
 * getSession():
 *   1. verifies the JWT signature/expiry,
 *   2. checks the sessions row (exists, not revoked, not expired),
 *   3. loads the user row for LIVE role + status.
 *
 * Consequences: revoking the row kills the session instantly; disabling a
 * user or changing their role takes effect on their very next request —
 * there is no "wait for token expiry" gap. The `role` claim inside the JWT
 * is only a coarse hint for the edge proxy and is never trusted server-side.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { v4 as uuid } from "uuid";
import { db, type User } from "./db";
import { normalizeRole, type Role } from "./rbac";

const COOKIE = "avl_session";
const DEV_FALLBACK_SECRET = "avlpoint-dev-secret-change-me-in-production";
const KNOWN_WEAK = new Set([DEV_FALLBACK_SECRET, "avl-prod-secret-rotate-me-8f2k9x"]);

function resolveSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < 32 || KNOWN_WEAK.has(s)) {
      throw new Error(
        "AUTH_SECRET must be set to a strong random value (32+ chars) in production."
      );
    }
    return s;
  }
  if (!s) console.warn("[auth] AUTH_SECRET not set — using dev fallback secret.");
  return s ?? DEV_FALLBACK_SECRET;
}

const secret = new TextEncoder().encode(resolveSecret());

/** Staff sessions are shorter-lived than customer sessions. */
const STAFF_SESSION_HOURS = 24;
const USER_SESSION_HOURS = 24 * 7;

export interface Session {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export async function createSession(
  user: { id: string; email: string; first_name?: string | null; role: string },
  meta?: { ip?: string; userAgent?: string }
): Promise<void> {
  const role = normalizeRole(user.role);
  const hours = ["super_admin", "admin", "support"].includes(role)
    ? STAFF_SESSION_HOURS
    : USER_SESSION_HOURS;

  const sessionId = uuid();
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
     VALUES (?, ?, datetime('now', ?), ?, ?)`
  ).run(sessionId, user.id, `+${hours} hours`, meta?.ip ?? null, meta?.userAgent ?? null);

  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * hours,
    path: "/",
  });
}

/**
 * Deduplicated per request via React cache() — layouts, pages, and actions
 * in the same render share one lookup.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.jti) return null;

    const row = db.prepare(
      `SELECT id FROM sessions
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
    ).get(payload.jti, payload.sub) as { id: string } | undefined;
    if (!row) return null;

    const user = db.prepare(
      "SELECT id, email, first_name, role, status, must_change_password FROM users WHERE id = ?"
    ).get(payload.sub) as Pick<User, "id" | "email" | "first_name" | "role" | "status" | "must_change_password"> | undefined;
    if (!user || user.status !== "active") return null;

    return {
      userId: user.id,
      sessionId: String(payload.jti),
      email: user.email,
      name: user.first_name ?? user.email.split("@")[0],
      role: normalizeRole(user.role),
      mustChangePassword: Boolean(user.must_change_password),
    };
  } catch {
    return null;
  }
});

export async function destroySession(): Promise<void> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (token) {
      const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null as null }));
      if (payload?.jti) {
        db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").run(payload.jti);
      }
    }
    jar.delete(COOKIE);
  } catch {
    const jar = await cookies();
    jar.delete(COOKIE);
  }
}

/* ---------------- Session administration ---------------- */

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export function listSessionsForUser(userId: string): SessionRow[] {
  return db.prepare(
    `SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 50`
  ).all(userId) as SessionRow[];
}

/** Revoke every active session for a user. Returns how many were revoked. */
export function revokeAllSessionsForUser(userId: string, exceptSessionId?: string): number {
  const res = exceptSessionId
    ? db.prepare(
        "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL AND id != ?"
      ).run(userId, exceptSessionId)
    : db.prepare(
        "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL"
      ).run(userId);
  return res.changes;
}

export function countActiveSessions(userId: string): number {
  return (db.prepare(
    "SELECT count(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')"
  ).get(userId) as { n: number }).n;
}
