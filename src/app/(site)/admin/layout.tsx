import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdminSession, ensurePlatformTables } from "@/lib/platform";
import { ensureAdminTables } from "@/lib/admin";
import { can, ROLE_LABELS, type Permission } from "@/lib/rbac";
import { AdminShell, type AdminNavItem } from "@/components/admin/admin-shell";

/**
 * The layout is the second gate (after src/proxy.ts) and the first
 * authoritative one: getSession() reads role + status live from the DB.
 * Individual pages still re-check their own view permission, and every
 * server action re-checks its mutation permission — the sidebar merely
 * mirrors what the role can reach.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isAdminSession(session)) redirect("/dashboard");
  if (session.mustChangePassword) redirect("/settings?pw=required");

  // Bootstrap tables on first admin load
  ensurePlatformTables();
  ensureAdminTables();

  const allNav: (AdminNavItem & { perm: Permission })[] = [
    { href: "/admin", label: "Dashboard", icon: "dashboard", perm: "admin.access" },
    { href: "/admin/monitor", label: "Pipeline Monitor", icon: "monitor", perm: "monitor.view" },
    { href: "/admin/vendors", label: "Vendors", icon: "vendors", perm: "vendors.view" },
    { href: "/admin/vendors/sleeping", label: "Sleeping Vendors", icon: "sleeping", perm: "vendors.view" },
    { href: "/admin/approval", label: "Approval Queue", icon: "approval", perm: "vendors.view" },
    { href: "/admin/bulk", label: "Bulk Operations", icon: "bulk", perm: "vendors.lifecycle" },
    { href: "/admin/users", label: "Users & Roles", icon: "users", perm: "users.view" },
    { href: "/admin/enterprises", label: "Enterprises", icon: "enterprises", perm: "orgs.view" },
    { href: "/admin/inspectors", label: "Inspectors", icon: "inspectors", perm: "inspectors.view" },
    { href: "/admin/audit", label: "Audit Log", icon: "audit", perm: "audit.view" },
    { href: "/admin/export", label: "Export", icon: "export", perm: "vendors.export" },
    { href: "/admin/settings", label: "Settings", icon: "settings", perm: "settings.view" },
  ];
  const nav: AdminNavItem[] = allNav
    .filter((item) => can(session.role, item.perm))
    .map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AdminShell nav={nav} email={session.email} roleLabel={ROLE_LABELS[session.role]}>
      {children}
    </AdminShell>
  );
}
