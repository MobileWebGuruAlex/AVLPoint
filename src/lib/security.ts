/**
 * Login throttling and request metadata helpers.
 *
 * Strategy: record every attempt in login_attempts, derive lockout by
 * querying the recent window. DB-backed (not in-memory) so it survives
 * dev-server restarts and works across processes.
 */
import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MINUTES = 15;
/** Failures for one email within the window before that email locks. */
const MAX_EMAIL_FAILURES = 5;
/** Failures from one IP within the window before that IP locks (spraying). */
const MAX_IP_FAILURES = 25;

export async function getClientMeta(): Promise<{ ip: string; userAgent: string }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || "local";
    const userAgent = (h.get("user-agent") ?? "").slice(0, 250);
    return { ip, userAgent };
  } catch {
    return { ip: "local", userAgent: "" };
  }
}

export interface LockoutState {
  locked: boolean;
  /** Seconds until the oldest counted failure ages out of the window. */
  retryAfterSec: number;
}

export function checkLockout(email: string, ip: string): LockoutState {
  const windowStart = `-${WINDOW_MINUTES} minutes`;

  const emailRows = db.prepare(
    `SELECT attempted_at FROM login_attempts
     WHERE email = ? AND success = 0 AND attempted_at >= datetime('now', ?)
     ORDER BY attempted_at ASC`
  ).all(email, windowStart) as { attempted_at: string }[];

  const ipRows = ip === "local" ? [] : db.prepare(
    `SELECT attempted_at FROM login_attempts
     WHERE ip = ? AND success = 0 AND attempted_at >= datetime('now', ?)
     ORDER BY attempted_at ASC`
  ).all(ip, windowStart) as { attempted_at: string }[];

  const overEmail = emailRows.length >= MAX_EMAIL_FAILURES;
  const overIp = ipRows.length >= MAX_IP_FAILURES;
  if (!overEmail && !overIp) return { locked: false, retryAfterSec: 0 };

  const oldest = (overEmail ? emailRows : ipRows)[0]?.attempted_at;
  let retryAfterSec = WINDOW_MINUTES * 60;
  if (oldest) {
    const agedOutAt = new Date(oldest.replace(" ", "T") + "Z").getTime() + WINDOW_MINUTES * 60_000;
    retryAfterSec = Math.max(30, Math.ceil((agedOutAt - Date.now()) / 1000));
  }
  return { locked: true, retryAfterSec };
}

export function recordLoginAttempt(email: string, ip: string, success: boolean): void {
  try {
    db.prepare(
      "INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)"
    ).run(email, ip, success ? 1 : 0);
    // Successful login clears the slate for that account.
    if (success) {
      db.prepare("DELETE FROM login_attempts WHERE email = ? AND success = 0").run(email);
    }
    // Opportunistic cleanup — keep the table from growing unbounded.
    if (Math.random() < 0.02) {
      db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-2 days')").run();
    }
  } catch (err) {
    console.warn("[security] failed to record login attempt", err);
  }
}

export function lockoutMessage(state: LockoutState): string {
  const min = Math.ceil(state.retryAfterSec / 60);
  return `Too many failed attempts. Try again in ${min} minute${min === 1 ? "" : "s"}.`;
}
