#!/usr/bin/env node
/**
 * Create or promote a staff account from the terminal.
 *
 * This is the ONLY sanctioned back door: it requires shell access to the
 * server, prints any generated password exactly once, and writes an audit
 * row. Use it for first-run setup and lockout recovery.
 *
 *   node scripts/create-admin.mjs <email> [--role super_admin|admin|support]
 *                                         [--reset-password] [--name First]
 *
 * Examples:
 *   node scripts/create-admin.mjs you@company.com --role super_admin
 *   node scripts/create-admin.mjs ops@company.com --role admin --reset-password
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROLES = ["super_admin", "admin", "support"];
const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const role = args.includes("--role") ? args[args.indexOf("--role") + 1] : "super_admin";
const resetPassword = args.includes("--reset-password");
const name = args.includes("--name") ? args[args.indexOf("--name") + 1] : null;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: node scripts/create-admin.mjs <email> [--role super_admin|admin|support] [--reset-password] [--name First]");
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "vendors.db"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

const existing = db.prepare("SELECT id, email, role FROM users WHERE email = ?").get(email);
const uuid = () => crypto.randomUUID();
const genPassword = () => crypto.randomBytes(12).toString("base64url"); // 16 chars, URL-safe

const audit = db.prepare(
  `INSERT INTO admin_actions (id, admin_user_id, admin_email, action_type, entity_type, entity_id, details)
   VALUES (?, 'cli', 'create-admin.mjs', ?, 'user', ?, ?)`
);

if (existing) {
  db.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ?").run(role, existing.id);
  let passwordNote = "(password unchanged)";
  if (resetPassword) {
    const pw = genPassword();
    db.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?"
    ).run(bcrypt.hashSync(pw, 12), existing.id);
    db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(existing.id);
    passwordNote = `temporary password: ${pw}  (must be changed at first login)`;
  }
  audit.run(uuid(), "user.promote_cli", existing.id, JSON.stringify({ email, from: existing.role, to: role, resetPassword }));
  console.log(`Promoted ${email}: ${existing.role} -> ${role}. ${passwordNote}`);
} else {
  const pw = genPassword();
  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, first_name, status, must_change_password)
     VALUES (?, ?, ?, ?, ?, 'active', 1)`
  ).run(id, email, bcrypt.hashSync(pw, 12), role, name);
  audit.run(uuid(), "user.create_cli", id, JSON.stringify({ email, role }));
  console.log(`Created ${role} account for ${email}`);
  console.log(`Temporary password: ${pw}`);
  console.log("It must be changed at first login. This is the only time it is shown.");
}
db.close();
