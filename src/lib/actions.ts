"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db, User } from "./db";
import { createSession, destroySession, getSession, revokeAllSessionsForUser } from "./auth";
import { setSaved } from "./vendors";
import { checkLockout, recordLoginAttempt, lockoutMessage, getClientMeta } from "./security";
import { logAudit } from "./audit";
import { isStaffRole } from "./rbac";
import { acceptInvitation } from "./users-admin";
import { newVerifyToken } from "./profiles";

export interface FormState {
  error?: string;
  success?: string;
}

/* ---------------- Authentication ---------------- */

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const role = formData.get("role") === "vendor" ? "vendor" : "buyer";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return { error: "An account with this email already exists." };

    const user = {
      id: uuid(),
      email,
      password_hash: await bcrypt.hash(password, 10),
      role,
      first_name: firstName || null,
    };
    db.prepare(
      "INSERT INTO users (id, email, password_hash, role, first_name) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, user.email, user.password_hash, user.role, user.first_name);

    await createSession(user);
  } catch {
    return { error: "Could not create your account right now. Please try again." };
  }
  redirect("/dashboard");
}

/**
 * A dummy bcrypt hash ("this-password-never-matches") compared against when
 * the account doesn't exist, so missing-user and wrong-password responses
 * take the same time.
 */
const DUMMY_HASH = "$2b$10$.MdQYUjyjsbeZ6N4a.98guuhzlC4NHEbh7Zds5t.O1tXWNYSxoPYK";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const { ip, userAgent } = await getClientMeta();

  const lock = checkLockout(email, ip);
  if (lock.locked) return { error: lockoutMessage(lock) };

  let user: User | undefined;
  try {
    user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
  } catch {
    return { error: "Sign-in is unavailable right now. Please try again." };
  }

  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    recordLoginAttempt(email, ip, false);
    logAudit({
      actorId: user?.id ?? "-", actorEmail: email, action: "auth.login_failed",
      entityType: "user", entityId: user?.id ?? null,
    });
    return { error: "Incorrect email or password." };
  }

  if (user.status !== "active") {
    recordLoginAttempt(email, ip, false);
    logAudit({
      actorId: user.id, actorEmail: email, action: "auth.login_blocked_disabled",
      entityType: "user", entityId: user.id,
    });
    return { error: "This account has been disabled. Contact an administrator." };
  }

  recordLoginAttempt(email, ip, true);
  await createSession(user, { ip, userAgent });
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  logAudit({
    actorId: user.id, actorEmail: email, action: "auth.login",
    entityType: "user", entityId: user.id, details: { ip },
  });

  if (user.must_change_password) redirect("/settings?pw=required");
  redirect(isStaffRole(user.role) ? "/admin" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

/** Change own password. Requires the current password even when forced. */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < 10) return { error: "New password must be at least 10 characters." };
  if (next !== confirm) return { error: "New passwords don't match." };

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId) as User | undefined;
  if (!user) return { error: "Account not found." };
  if (!(await bcrypt.compare(current, user.password_hash))) {
    return { error: "Current password is incorrect." };
  }

  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?"
  ).run(await bcrypt.hash(next, 12), user.id);

  // Kick every other device — only the session that changed the password survives.
  revokeAllSessionsForUser(user.id, session.sessionId);
  logAudit({
    actorId: user.id, actorEmail: user.email, action: "auth.password_changed",
    entityType: "user", entityId: user.id,
  });
  return { success: "Password updated. Other signed-in devices were logged out." };
}

/** Accept an invitation link: create the account and sign in. */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (password !== confirm) return { error: "Passwords don't match." };

  const result = acceptInvitation(token, { firstName, password });
  if (!result.success || !result.user) {
    return { error: result.error ?? "Could not accept the invitation." };
  }

  const { ip, userAgent } = await getClientMeta();
  await createSession(result.user, { ip, userAgent });
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(result.user.id);
  redirect(isStaffRole(result.user.role) ? "/admin" : "/dashboard");
}

/* ---------------- Saved vendors ---------------- */

export async function toggleSaveAction(vendorId: number, save: boolean): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    await setSaved(session.userId, vendorId, save);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/saved");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/* ---------------- Claim your company (Trust Ladder rung 2) ---------------- */

function ensureClaimTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS vendor_claims (
    id TEXT PRIMARY KEY,
    vendor_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    work_email TEXT NOT NULL,
    proof_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

/**
 * Files a claim for review. Approval stays manual (admin queue) — badge
 * integrity depends on it, per the access-tier plan. First-party, consented
 * data from claims is the compliance gold standard.
 */
export async function claimAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const vendorId = Number(formData.get("vendor_id"));
  const workEmail = String(formData.get("work_email") ?? "").trim().toLowerCase();
  const proof = String(formData.get("proof") ?? "").trim();

  if (!Number.isFinite(vendorId) || vendorId <= 0) return { error: "Pick your company from the directory first." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(workEmail)) return { error: "Enter your work email at the company." };

  try {
    ensureClaimTable();
    const existing = db
      .prepare("SELECT id FROM vendor_claims WHERE vendor_id = ? AND user_id = ? AND status = 'pending'")
      .get(vendorId, session.userId);
    if (existing) {
      return { success: "Your claim is already open — verify it from the banner on your company's profile page." };
    }
    db.prepare(
      "INSERT INTO vendor_claims (id, vendor_id, user_id, work_email, proof_note, verify_token) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(uuid(), vendorId, session.userId, workEmail, proof || null, newVerifyToken());
  } catch {
    return { error: "Could not file your claim right now. Please try again." };
  }
  revalidatePath(`/vendors/${vendorId}`);
  return {
    success:
      "Claim filed. Fastest path: open your company's profile page — you'll see a verification code to place on your website, and instant approval the moment we find it. Otherwise manual review takes 1–2 business days.",
  };
}

/* ---------------- Privacy: removal / do-not-sell requests ---------------- */

function ensureRemovalTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS removal_requests (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

/** CCPA/GDPR intake: delete-my-data, correct-my-data, or do-not-sell/share. */
export async function removalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const company = String(formData.get("company") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const kind = ["remove", "correct", "do-not-sell"].includes(String(formData.get("kind")))
    ? String(formData.get("kind"))
    : "remove";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email so we can confirm completion." };
  if (details.length < 5) return { error: "Tell us which record or fields this concerns." };

  try {
    ensureRemovalTable();
    db.prepare(
      "INSERT INTO removal_requests (id, kind, email, company, details) VALUES (?, ?, ?, ?, ?)"
    ).run(uuid(), kind, email, company || null, details);
  } catch {
    return { error: "Could not file the request right now. Email privacy@avlpoint.com instead." };
  }
  return {
    success:
      "Request logged. We process privacy requests within 30 days (usually much faster) and will confirm at the email you provided.",
  };
}

/* ---------------- Contact ---------------- */

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (message.length < 10) return { error: "Tell us a little more — at least 10 characters." };
  // Integration point: forward to CRM / support inbox once connected.
  console.log("[contact]", { email, subject: formData.get("subject"), message });
  return { success: "Message received. Our team will reply within one business day." };
}
