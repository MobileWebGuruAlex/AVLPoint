"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db, User } from "./db";
import { createSession, destroySession, getSession } from "./auth";
import { setSaved } from "./vendors";

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

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  let user: User | undefined;
  try {
    user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
  } catch {
    return { error: "Sign-in is unavailable right now. Please try again." };
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "Incorrect email or password." };
  }
  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
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
    if (existing) return { success: "Your claim is already in review — we'll email you when it's approved." };
    db.prepare(
      "INSERT INTO vendor_claims (id, vendor_id, user_id, work_email, proof_note) VALUES (?, ?, ?, ?, ?)"
    ).run(uuid(), vendorId, session.userId, workEmail, proof || null);
  } catch {
    return { error: "Could not file your claim right now. Please try again." };
  }
  return {
    success:
      "Claim received. We verify company-domain emails first; document review takes 1–2 business days. Once approved you can enrich your profile and move up the Trust Ladder.",
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
