"use server";

/**
 * Server actions for user / invitation / session administration.
 * Each is gated by an RBAC permission; deeper rules (staff handling,
 * last-super-admin, self-service limits) live in users-admin.ts.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import { can, type Permission } from "./rbac";
import type { FormState } from "./actions";
import {
  createUser, setUserRole, resetUserPassword,
  createInvitation, revokeInvitation, addNote,
} from "./users-admin";
import { setUserStatus, setOrgStatus } from "./states";
import { revokeCertification, getInspectorById } from "./platform";
import { upsertInspectorProfile } from "./profiles";
import { runBackup } from "./backup";
import { revokeAllSessionsForUser } from "./auth";
import { logAudit } from "./audit";
import { db } from "./db";
import { v4 as uuid } from "uuid";

async function requirePermission(perm: Permission) {
  const session = await getSession();
  if (!session) return { error: "Sign in first.", actor: null as never };
  if (!can(session.role, perm)) {
    return { error: "You don't have permission for this action.", actor: null as never };
  }
  return {
    error: null,
    actor: { userId: session.userId, email: session.email, role: session.role },
  };
}

function revalidateUsers() {
  revalidatePath("/admin/users", "layout");
  revalidatePath("/admin", "layout");
}

/* ---------------- Users ---------------- */

export async function createUserAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.manage");
  if (error) return { error };

  const result = createUser(
    {
      email: String(formData.get("email") ?? ""),
      firstName: String(formData.get("first_name") ?? ""),
      role: String(formData.get("role") ?? "buyer"),
    },
    actor
  );
  if (!result.success) return { error: result.error ?? "Could not create the user." };

  revalidateUsers();
  return {
    success: `Account created. Temporary password (shown once): ${result.tempPassword} — they must change it at first sign-in.`,
  };
}

export async function setUserRoleAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.manage");
  if (error) return { error };

  const result = setUserRole(
    String(formData.get("user_id") ?? ""),
    String(formData.get("role") ?? ""),
    actor
  );
  if (!result.success) return { error: result.error ?? "Role change failed." };

  revalidateUsers();
  return { success: "Role updated — takes effect on the user's next request." };
}

export async function setUserStatusAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.manage");
  if (error) return { error };

  const targetId = String(formData.get("user_id") ?? "");
  const status = formData.get("status") === "disabled" ? "disabled" : "active";
  const reason = String(formData.get("reason") ?? "").slice(0, 300);

  // Disabling a staff account is a staff-management act.
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(targetId) as { role: string } | undefined;
  if (target && ["super_admin", "admin", "support"].includes(target.role) && actor.role !== "super_admin") {
    return { error: "Only a super admin can disable staff accounts." };
  }

  const result = setUserStatus(targetId, status, actor, reason);
  if (!result.success) return { error: result.error ?? "Status change failed." };

  revalidateUsers();
  return {
    success: status === "disabled"
      ? "Account disabled — sign-in blocked and all sessions revoked. Reversible anytime."
      : "Account re-enabled.",
  };
}

export async function resetPasswordAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.manage");
  if (error) return { error };

  const result = resetUserPassword(String(formData.get("user_id") ?? ""), actor);
  if (!result.success) return { error: result.error ?? "Reset failed." };

  revalidateUsers();
  return {
    success: `Temporary password (shown once): ${result.tempPassword} — all their sessions were revoked.`,
  };
}

export async function revokeSessionsAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.manage");
  if (error) return { error };

  const targetId = String(formData.get("user_id") ?? "");
  const target = db.prepare("SELECT email FROM users WHERE id = ?").get(targetId) as { email: string } | undefined;
  if (!target) return { error: "User not found." };

  const n = revokeAllSessionsForUser(targetId);
  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "session.revoke_all",
    entityType: "user", entityId: targetId, entityLabel: target.email, details: { revoked: n },
  });
  revalidateUsers();
  return { success: `${n} active session${n === 1 ? "" : "s"} revoked.` };
}

/* ---------------- Invitations ---------------- */

export async function inviteAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.invite");
  if (error) return { error };

  const result = createInvitation(
    {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "buyer"),
      orgId: String(formData.get("org_id") ?? "") || null,
    },
    actor
  );
  if (!result.success) return { error: result.error ?? "Could not create the invitation." };

  revalidateUsers();
  return { success: `Invitation created — share this link (valid 7 days): /invite/${result.token}` };
}

export async function revokeInviteAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("users.invite");
  if (error) return { error };

  const ok = revokeInvitation(String(formData.get("token") ?? ""), actor);
  if (!ok) return { error: "Invitation not found or already used." };

  revalidateUsers();
  return { success: "Invitation revoked." };
}

/* ---------------- Notes ---------------- */

export async function addNoteAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("notes.write");
  if (error) return { error };

  const entityType = String(formData.get("entity_type") ?? "");
  const entityId = String(formData.get("entity_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!entityType || !entityId) return { error: "Missing target." };
  if (note.length < 2) return { error: "Write a note first." };

  addNote(entityType, entityId, note, actor);
  revalidatePath("/admin", "layout");
  return { success: "Note added." };
}

/* ---------------- Backups ---------------- */

export async function runBackupAction(_p: FormState, _formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("backups.run");
  if (error) return { error };

  const result = await runBackup(actor);
  if (!result.success) return { error: result.error ?? "Backup failed." };

  revalidatePath("/admin/settings");
  const mb = ((result.sizeBytes ?? 0) / 1024 / 1024).toFixed(1);
  return {
    success: `Backup written: ${result.file} (${mb} MB in ${result.tookMs} ms)` +
      (result.externalCopied ? " — mirrored to external directory." : "."),
  };
}

/* ---------------- Orgs (used by /admin/enterprises) ---------------- */

export async function setOrgStatusAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("orgs.manage");
  if (error) return { error };

  const orgId = String(formData.get("org_id") ?? "");
  const status = formData.get("status") === "sleeping" ? "sleeping" : "active";
  const reason = String(formData.get("reason") ?? "").slice(0, 300);

  const result = setOrgStatus(orgId, status, actor, reason);
  if (!result.success) return { error: result.error ?? "Status change failed." };

  revalidatePath("/admin/enterprises");
  revalidatePath("/sandbox");
  return {
    success: status === "sleeping"
      ? "Workspace put to sleep — members keep their accounts but workspace features pause."
      : "Workspace re-activated.",
  };
}

export async function createOrgAdminAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("orgs.manage");
  if (error) return { error };

  const name = String(formData.get("name") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  if (name.length < 2) return { error: "Give the workspace a name." };

  const owner = db.prepare("SELECT id, email FROM users WHERE email = ?").get(ownerEmail) as
    { id: string; email: string } | undefined;
  if (!owner) return { error: "No account exists for that owner email — create or invite the user first." };

  const existing = db.prepare("SELECT org_id FROM org_members WHERE user_id = ?").get(owner.id);
  if (existing) return { error: "That user already belongs to a workspace." };

  const id = uuid();
  db.prepare("INSERT INTO orgs (id, name, created_by, status) VALUES (?, ?, ?, 'active')").run(id, name.slice(0, 80), owner.id);
  db.prepare("INSERT INTO org_members (org_id, user_id, email, role) VALUES (?, ?, ?, 'admin')").run(id, owner.id, owner.email);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "org.create",
    entityType: "org", entityId: id, entityLabel: name, details: { owner: ownerEmail },
  });
  revalidatePath("/admin/enterprises");
  return { success: `Workspace "${name}" created with ${ownerEmail} as workspace admin.` };
}

export async function addOrgMemberAdminAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("orgs.manage");
  if (error) return { error };

  const orgId = String(formData.get("org_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const org = db.prepare("SELECT id, name FROM orgs WHERE id = ?").get(orgId) as { id: string; name: string } | undefined;
  if (!org) return { error: "Workspace not found." };
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
  if (!user) return { error: "No account exists for that email — create or invite the user first." };

  db.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, email, role) VALUES (?, ?, ?, 'member')")
    .run(orgId, user.id, email);
  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "org.member_add",
    entityType: "org", entityId: orgId, entityLabel: org.name, details: { member: email },
  });
  revalidatePath("/admin/enterprises");
  return { success: `${email} added to ${org.name}.` };
}

/* ---------------- Inspectors (used by /admin/inspectors) ---------------- */

export async function revokeCertificationAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("inspectors.manage");
  if (error) return { error };

  const certId = String(formData.get("cert_id") ?? "");
  const revoked = revokeCertification(certId);
  if (!revoked) return { error: "Certification not found." };

  logAudit({
    actorId: actor.userId, actorEmail: actor.email, action: "certification.revoke",
    entityType: "vendor", entityId: revoked.vendor_id, entityLabel: revoked.company_name,
    details: { cert_id: certId },
  });
  revalidatePath("/admin/inspectors");
  return { success: `Certification revoked for ${revoked.company_name ?? "vendor"}.` };
}

/**
 * Inspector self-service profile save. The inspector who owns the listing
 * (or staff with inspectors.manage) may edit; anyone else is rejected.
 */
export async function updateInspectorProfileAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };

  const inspectorId = String(formData.get("inspector_id") ?? "");
  const inspector = getInspectorById(inspectorId);
  if (!inspector) return { error: "Inspector listing not found." };
  if (inspector.user_id !== session.userId && !can(session.role, "inspectors.manage")) {
    return { error: "Only the listing owner can edit this profile." };
  }

  const parseList = (key: string): string[] => {
    try {
      const v = JSON.parse(String(formData.get(key) ?? "[]"));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  upsertInspectorProfile(inspectorId, {
    template: String(formData.get("template") ?? "field"),
    accent: String(formData.get("accent") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    photoImage: String(formData.get("photo_image") ?? ""),
    bannerImage: String(formData.get("banner_image") ?? ""),
    gallery: parseList("gallery"),
    certifications: parseList("certifications"),
    serviceRegions: parseList("service_regions"),
    specialties: parseList("specialties"),
    pricingNote: String(formData.get("pricing_note") ?? ""),
    yearsExperience: Number(formData.get("years_experience") ?? "") || undefined,
  });

  revalidatePath(`/inspectors/${inspectorId}`);
  revalidatePath("/inspections");
  return { success: "Profile published — your marketplace card and public page are updated." };
}

export async function setInspectorStatusAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("inspectors.manage");
  if (error) return { error };

  const id = String(formData.get("inspector_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["approved", "suspended", "pending"].includes(status)) return { error: "Invalid status." };

  const inspector = db.prepare("SELECT id, company, house FROM inspectors WHERE id = ?").get(id) as
    { id: string; company: string; house: number } | undefined;
  if (!inspector) return { error: "Inspector not found." };
  if (inspector.house === 1 && status !== "approved") {
    return { error: "The house inspection team cannot be suspended." };
  }

  db.prepare("UPDATE inspectors SET status = ? WHERE id = ?").run(status, id);
  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: status === "approved" ? "inspector.approve" : status === "suspended" ? "inspector.suspend" : "inspector.reset",
    entityType: "inspector", entityId: id, entityLabel: inspector.company,
  });
  revalidatePath("/admin/inspectors");
  revalidatePath("/inspections");
  return { success: `${inspector.company} is now ${status}.` };
}

/** Shared field reader for inspector create/edit forms. */
function readInspectorFields(formData: FormData) {
  return {
    company: String(formData.get("company") ?? "").trim().slice(0, 120),
    credentials: String(formData.get("credentials") ?? "").trim().slice(0, 300),
    regions: String(formData.get("regions") ?? "").trim().slice(0, 300),
    basePrice: String(formData.get("base_price") ?? "").trim().slice(0, 120),
    userEmail: String(formData.get("user_email") ?? "").trim().toLowerCase().slice(0, 254),
  };
}

/** Resolve an optional login-account link by email. Returns {userId} | {error}. */
function resolveInspectorUser(userEmail: string): { userId: string | null; error?: string } {
  if (!userEmail) return { userId: null };
  const user = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(userEmail) as
    { id: string } | undefined;
  if (!user) {
    return {
      userId: null,
      error: `No account exists for ${userEmail}. Create or invite them under Users & Roles first, then link here.`,
    };
  }
  return { userId: user.id };
}

export async function createInspectorAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("inspectors.manage");
  if (error) return { error };

  const f = readInspectorFields(formData);
  if (!f.company) return { error: "Company name is required." };

  const link = resolveInspectorUser(f.userEmail);
  if (link.error) return { error: link.error };

  const id = uuid();
  db.prepare(
    `INSERT INTO inspectors (id, user_id, company, credentials, regions, base_price, house, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'approved')`
  ).run(id, link.userId ?? "unlinked", f.company, f.credentials, f.regions, f.basePrice);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: "inspector.create", entityType: "inspector", entityId: id, entityLabel: f.company,
    details: { linkedAccount: link.userId ? f.userEmail : null },
  });
  revalidatePath("/admin/inspectors");
  revalidatePath("/inspections");
  return { success: `${f.company} added to the inspector roster.` };
}

export async function updateInspectorAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { error, actor } = await requirePermission("inspectors.manage");
  if (error) return { error };

  const id = String(formData.get("inspector_id") ?? "");
  const existing = db.prepare("SELECT id, company, house, user_id FROM inspectors WHERE id = ?").get(id) as
    { id: string; company: string; house: number; user_id: string } | undefined;
  if (!existing) return { error: "Inspector not found." };

  const f = readInspectorFields(formData);
  if (!f.company) return { error: "Company name is required." };

  // Blank email keeps the current link; a value re-links (house team stays system-owned).
  let userId = existing.user_id;
  if (f.userEmail && existing.house !== 1) {
    const link = resolveInspectorUser(f.userEmail);
    if (link.error) return { error: link.error };
    userId = link.userId ?? existing.user_id;
  }

  db.prepare(
    "UPDATE inspectors SET company = ?, credentials = ?, regions = ?, base_price = ?, user_id = ? WHERE id = ?"
  ).run(f.company, f.credentials, f.regions, f.basePrice, userId, id);

  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: "inspector.update", entityType: "inspector", entityId: id, entityLabel: f.company,
  });
  revalidatePath("/admin/inspectors");
  revalidatePath("/inspections");
  return { success: `${f.company} updated.` };
}
