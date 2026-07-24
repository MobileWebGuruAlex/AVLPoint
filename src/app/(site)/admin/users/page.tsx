import type { Metadata } from "next";
import Link from "next/link";
import { Users, UserPlus, MailPlus, ShieldCheck, Ban } from "lucide-react";
import { getSession } from "@/lib/auth";
import { can, ALL_ROLES, STAFF_ROLES, ROLE_LABELS, type Role } from "@/lib/rbac";
import { listUsers, userStats, listPendingInvitations } from "@/lib/users-admin";
import { createUserAction, inviteAction, revokeInviteAction } from "@/lib/user-actions";
import { ActionForm } from "@/components/action-form";
import { Badge, Input, Select, Label } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Users — Admin" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function roleTone(role: string): "arc" | "ok" | "warn" | "neutral" {
  if (role === "super_admin") return "warn";
  if (role === "admin" || role === "support") return "arc";
  if (role === "vendor" || role === "inspector") return "ok";
  return "neutral";
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || !can(session.role, "users.view")) return null;
  const canManage = can(session.role, "users.manage");
  const canInvite = can(session.role, "users.invite");
  const isSuper = session.role === "super_admin";

  const sp = await searchParams;
  const filters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    role: typeof sp.role === "string" && sp.role !== "any" ? sp.role : undefined,
    status: typeof sp.status === "string" && sp.status !== "any" ? sp.status : undefined,
    page: sp.page ? Number(sp.page) : 1,
  };

  const { users, total } = listUsers(filters);
  const stats = userStats();
  const invitations = canInvite ? listPendingInvitations() : [];
  const staffCount = stats.byRole
    .filter((r) => (STAFF_ROLES as readonly string[]).includes(r.role))
    .reduce((a, b) => a + b.count, 0);

  // Roles this actor may assign — super admin can assign anything,
  // ops admins only tenant roles.
  const assignableRoles = (isSuper ? ALL_ROLES : ALL_ROLES.filter((r) => !(STAFF_ROLES as readonly string[]).includes(r))) as Role[];
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Access Control</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">Users &amp; Roles</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatNumber(stats.total)} accounts · {staffCount} staff · {stats.disabled} disabled
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-52 flex-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" placeholder="Email or name…" defaultValue={filters.q ?? ""} />
        </div>
        <div className="w-44">
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" defaultValue={filters.role ?? "any"}>
            <option value="any">Any role</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={filters.status ?? "any"}>
            <option value="any">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-[10px] border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:border-arc/50"
        >
          Filter
        </button>
      </form>

      {/* User table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-175 text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sessions</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm italic text-fg-muted">
                  No users match these filters.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60 transition-colors hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-fg hover:text-arc">
                    {u.email}
                  </Link>
                  {(u.first_name || u.last_name) && (
                    <p className="text-xs text-fg-muted">{[u.first_name, u.last_name].filter(Boolean).join(" ")}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={roleTone(u.role)}>
                    {(STAFF_ROLES as readonly string[]).includes(u.role) && <ShieldCheck size={11} />}
                    {ROLE_LABELS[u.role as Role] ?? u.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.status === "disabled"
                    ? <Badge tone="warn"><Ban size={11} /> Disabled</Badge>
                    : <Badge tone="ok">Active</Badge>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-fg-secondary">{u.active_sessions}</td>
                <td className="px-4 py-3 font-mono text-xs text-fg-muted">{u.last_login_at?.slice(0, 16) ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-fg-muted">{u.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {filters.page > 1 && (
            <Link className="text-arc hover:underline" href={`/admin/users?page=${filters.page - 1}`}>← Prev</Link>
          )}
          <span className="text-fg-muted">Page {filters.page} of {pages}</span>
          {filters.page < pages && (
            <Link className="text-arc hover:underline" href={`/admin/users?page=${filters.page + 1}`}>Next →</Link>
          )}
        </div>
      )}

      {/* Create + Invite */}
      {(canManage || canInvite) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {canManage && (
            <section className="card p-5">
              <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-fg">
                <UserPlus size={15} className="text-arc" /> Create account
              </h2>
              <p className="mb-4 text-xs text-fg-muted">
                Generates a one-time temporary password; the user must change it at first sign-in.
              </p>
              <ActionForm action={createUserAction} submitLabel="Create account" size="sm" variant="secondary">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cu-email">Email</Label>
                    <Input id="cu-email" name="email" type="email" required placeholder="person@company.com" />
                  </div>
                  <div>
                    <Label htmlFor="cu-name">First name</Label>
                    <Input id="cu-name" name="first_name" placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="cu-role">Role</Label>
                  <Select id="cu-role" name="role" defaultValue="buyer">
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                  {!isSuper && (
                    <p className="mt-1 text-[11px] text-fg-muted">Staff roles can only be granted by a super admin.</p>
                  )}
                </div>
              </ActionForm>
            </section>
          )}

          {canInvite && (
            <section className="card p-5">
              <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-fg">
                <MailPlus size={15} className="text-arc" /> Invite by link
              </h2>
              <p className="mb-4 text-xs text-fg-muted">
                Creates a single-use signup link (valid 7 days) that pre-assigns the role. The invitee picks their own password.
              </p>
              <ActionForm action={inviteAction} submitLabel="Create invitation" size="sm" variant="secondary">
                <div>
                  <Label htmlFor="inv-email">Email</Label>
                  <Input id="inv-email" name="email" type="email" required placeholder="person@company.com" />
                </div>
                <div>
                  <Label htmlFor="inv-role">Role</Label>
                  <Select id="inv-role" name="role" defaultValue="buyer">
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                </div>
              </ActionForm>

              {invitations.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                    Pending invitations ({invitations.length})
                  </h3>
                  <ul className="space-y-2">
                    {invitations.map((inv) => (
                      <li key={inv.token} className="rounded-lg border border-line px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-fg">{inv.email}</span>
                          <Badge tone={roleTone(inv.role)}>{ROLE_LABELS[inv.role as Role] ?? inv.role}</Badge>
                        </div>
                        <p className="mt-1 break-all font-mono text-[10px] text-fg-muted select-all">
                          /invite/{inv.token}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-fg-muted">expires {inv.expires_at?.slice(0, 10)}</span>
                          <ActionForm action={revokeInviteAction} submitLabel="Revoke" size="sm" variant="danger" inline>
                            <input type="hidden" name="token" value={inv.token} />
                          </ActionForm>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {!canManage && (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <Users size={13} /> You have read-only access to user records.
        </p>
      )}
    </div>
  );
}
