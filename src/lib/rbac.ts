/**
 * Role-based access control.
 *
 * Two planes of access:
 *
 *  1. STAFF plane (this file's permission matrix) — internal operators of
 *     the AVLpoint platform. Roles: super_admin, admin, support. These are
 *     the only roles that can enter /admin, and what they can do there is
 *     decided per-permission below.
 *
 *  2. TENANT plane — customers. Roles: buyer (enterprise user), vendor,
 *     inspector. Their capabilities are scoped by ownership rows
 *     (org_members, vendor_owners, inspectors.user_id), never by this
 *     matrix. A tenant role always has zero staff permissions.
 *
 * The role lives in the users table and is read fresh from the DB on every
 * request (see auth.getSession), so demotions and disables take effect
 * immediately — not at next token refresh.
 */

export type Role =
  | "super_admin"
  | "admin"
  | "support"
  | "buyer"
  | "vendor"
  | "inspector";

export const STAFF_ROLES = ["super_admin", "admin", "support"] as const;
export const TENANT_ROLES = ["buyer", "vendor", "inspector"] as const;
export const ALL_ROLES = [...STAFF_ROLES, ...TENANT_ROLES] as Role[];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Ops Admin",
  support: "Support (read-only)",
  buyer: "Enterprise user",
  vendor: "Vendor",
  inspector: "Inspector",
};

export type Permission =
  | "admin.access"        // may enter /admin at all
  | "vendors.view"
  | "vendors.edit"        // field edits, keywords, tags
  | "vendors.lifecycle"   // approve / reject / stage changes
  | "vendors.sleep"       // sleep + wake (reversible)
  | "vendors.delete"      // hard delete (irreversible)
  | "vendors.export"
  | "users.view"
  | "users.manage"        // create, disable, reset password, revoke sessions
  | "users.invite"
  | "staff.manage"        // grant/revoke staff roles
  | "orgs.view"
  | "orgs.manage"         // create, sleep/wake, membership
  | "inspectors.view"
  | "inspectors.manage"   // approve, suspend, reassign
  | "audit.view"
  | "notes.write"
  | "settings.view"
  | "backups.run";

const SUPPORT_PERMS: Permission[] = [
  "admin.access",
  "vendors.view",
  "users.view",
  "orgs.view",
  "inspectors.view",
  "audit.view",
  "settings.view",
];

const ADMIN_PERMS: Permission[] = [
  ...SUPPORT_PERMS,
  "vendors.edit",
  "vendors.lifecycle",
  "vendors.sleep",
  "vendors.export",
  "users.manage",
  "users.invite",
  "orgs.manage",
  "inspectors.manage",
  "notes.write",
  "backups.run",
];

/**
 * super_admin additionally holds "staff.manage" and "vendors.delete" —
 * the two irreversible/authority-granting powers stay at the top.
 */
const MATRIX: Record<Role, Permission[] | "*"> = {
  super_admin: "*",
  admin: ADMIN_PERMS,
  support: SUPPORT_PERMS,
  buyer: [],
  vendor: [],
  inspector: [],
};

export function normalizeRole(role: string | null | undefined): Role {
  return (ALL_ROLES as string[]).includes(role ?? "") ? (role as Role) : "buyer";
}

export function isStaffRole(role: string | null | undefined): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

export function can(role: string | null | undefined, perm: Permission): boolean {
  const perms = MATRIX[normalizeRole(role)];
  return perms === "*" || perms.includes(perm);
}

/** Permissions a role holds, expanded (for the UI matrix). */
export function permissionsFor(role: Role): Permission[] {
  const perms = MATRIX[role];
  if (perms === "*") {
    return [
      ...ADMIN_PERMS,
      "staff.manage",
      "vendors.delete",
    ];
  }
  return perms;
}
