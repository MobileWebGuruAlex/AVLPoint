import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ShieldCheck, KeyRound, MonitorX, Ban, CheckCircle2, StickyNote,
} from "lucide-react";
import { getSession, listSessionsForUser } from "@/lib/auth";
import { can, ALL_ROLES, STAFF_ROLES, ROLE_LABELS, type Role } from "@/lib/rbac";
import { getUserDetail, listNotes } from "@/lib/users-admin";
import { queryAudit } from "@/lib/audit";
import {
  setUserRoleAction, setUserStatusAction, resetPasswordAction,
  revokeSessionsAction, addNoteAction,
} from "@/lib/user-actions";
import { ActionForm } from "@/components/action-form";
import { Badge, Select, Label, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "User — Admin" };

interface Props { params: Promise<{ id: string }> }

export default async function AdminUserDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || !can(session.role, "users.view")) return null;

  const { id } = await params;
  const user = getUserDetail(id);
  if (!user) notFound();

  const canManage = can(session.role, "users.manage");
  const isSuper = session.role === "super_admin";
  const targetIsStaff = (STAFF_ROLES as readonly string[]).includes(user.role);
  const isSelf = user.id === session.userId;
  // Managing staff accounts is a super-admin power.
  const mayAdminister = canManage && (!targetIsStaff || isSuper);

  const sessions = listSessionsForUser(id);
  const notes = listNotes("user", id);
  const { rows: history } = queryAudit({ entityType: "user", entityId: id, pageSize: 15 });
  const assignableRoles = (isSuper ? ALL_ROLES : ALL_ROLES.filter((r) => !(STAFF_ROLES as readonly string[]).includes(r))) as Role[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-arc">
          <ArrowLeft size={12} /> All users
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">{user.email}</h1>
          <Badge tone={targetIsStaff ? "warn" : "neutral"}>
            {targetIsStaff && <ShieldCheck size={11} />}
            {ROLE_LABELS[user.role as Role] ?? user.role}
          </Badge>
          {user.status === "disabled"
            ? <Badge tone="warn"><Ban size={11} /> Disabled</Badge>
            : <Badge tone="ok">Active</Badge>}
          {Boolean(user.must_change_password) && <Badge tone="arc">Must change password</Badge>}
        </div>
        <p className="mt-1 font-mono text-xs text-fg-muted">
          {[user.first_name, user.last_name].filter(Boolean).join(" ") || "No name on file"} ·
          created {user.created_at?.slice(0, 10)} · last sign-in {user.last_login_at?.slice(0, 16) ?? "never"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Membership + ownership */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-fg">Tenant links</h2>
          <div className="space-y-2 text-sm">
            <p className="text-fg-secondary">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Workspace · </span>
              {user.org ? `${user.org.name} (${user.org.role})` : "None"}
            </p>
            <div className="text-fg-secondary">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Owned vendor profiles</span>
              {user.owned_vendors.length === 0 ? (
                <p className="text-fg-muted">None</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {user.owned_vendors.map((v) => (
                    <li key={v.id}>
                      <Link href={`/admin/vendors/${v.id}`} className="text-arc hover:underline">{v.company_name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Access controls */}
        {mayAdminister && !isSelf && (
          <section className="card p-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-fg">Access controls</h2>
            <div className="space-y-4">
              <ActionForm action={setUserRoleAction} submitLabel="Change role" size="sm" variant="secondary" inline>
                <input type="hidden" name="user_id" value={user.id} />
                <div className="w-52">
                  <Label htmlFor="role">Role</Label>
                  <Select id="role" name="role" defaultValue={user.role}>
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                    {!assignableRoles.includes(user.role as Role) && (
                      <option value={user.role}>{ROLE_LABELS[user.role as Role] ?? user.role}</option>
                    )}
                  </Select>
                </div>
              </ActionForm>

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                {user.status === "active" ? (
                  <ActionForm action={setUserStatusAction} submitLabel="Disable account" size="sm" variant="danger" inline>
                    <input type="hidden" name="user_id" value={user.id} />
                    <input type="hidden" name="status" value="disabled" />
                  </ActionForm>
                ) : (
                  <ActionForm action={setUserStatusAction} submitLabel="Re-enable account" size="sm" variant="secondary" inline>
                    <input type="hidden" name="user_id" value={user.id} />
                    <input type="hidden" name="status" value="active" />
                  </ActionForm>
                )}
                <ActionForm action={resetPasswordAction} submitLabel="Reset password" size="sm" variant="secondary" inline>
                  <input type="hidden" name="user_id" value={user.id} />
                </ActionForm>
                <ActionForm action={revokeSessionsAction} submitLabel="Revoke sessions" size="sm" variant="secondary" inline>
                  <input type="hidden" name="user_id" value={user.id} />
                </ActionForm>
              </div>
              <p className="text-[11px] leading-relaxed text-fg-muted">
                Disabling blocks sign-in and revokes all sessions; it never deletes data and can be undone anytime.
                Password resets produce a one-time temporary password shown only to you.
              </p>
            </div>
          </section>
        )}
        {isSelf && (
          <section className="card p-5">
            <h2 className="mb-2 font-display text-sm font-semibold text-fg">Access controls</h2>
            <p className="text-sm text-fg-muted">
              This is your own account — manage your password in <Link href="/settings" className="text-arc hover:underline">Settings</Link>.
              Self-service role or status changes are intentionally blocked.
            </p>
          </section>
        )}
      </div>

      {/* Sessions */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <MonitorX size={15} className="text-arc" /> Active sessions ({sessions.length})
        </h2>
        {sessions.length === 0 && <p className="text-sm italic text-fg-muted">No active sessions.</p>}
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <span className="font-mono text-fg-secondary">{s.ip ?? "unknown ip"}</span>
              <span className="max-w-90 truncate text-fg-muted">{s.user_agent ?? ""}</span>
              <span className="font-mono text-fg-muted">
                {s.created_at?.slice(0, 16)} → {s.expires_at?.slice(0, 16)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <StickyNote size={15} className="text-arc" /> Internal notes
        </h2>
        {can(session.role, "notes.write") && (
          <ActionForm action={addNoteAction} submitLabel="Add note" size="sm" variant="secondary" className="mb-4">
            <input type="hidden" name="entity_type" value="user" />
            <input type="hidden" name="entity_id" value={user.id} />
            <Textarea name="note" rows={2} placeholder="Visible to staff only…" />
          </ActionForm>
        )}
        {notes.length === 0 && <p className="text-sm italic text-fg-muted">No notes yet.</p>}
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <p className="text-fg-secondary">{n.note}</p>
              <p className="mt-1 font-mono text-[10px] text-fg-muted">{n.author_email} · {n.created_at?.slice(0, 16)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* History */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <CheckCircle2 size={15} className="text-arc" /> Account history
        </h2>
        {history.length === 0 && <p className="text-sm italic text-fg-muted">Nothing recorded yet.</p>}
        <div className="space-y-1.5">
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge tone={h.action_type.includes("fail") || h.action_type.includes("disable") ? "warn" : "neutral"}>
                  {h.action_type}
                </Badge>
                <span className="text-fg-muted">by {h.admin_email}</span>
              </div>
              <span className="font-mono text-fg-muted">{h.created_at?.slice(0, 16)}</span>
            </div>
          ))}
        </div>
        <Link href={`/admin/audit?entityType=user&entityId=${user.id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-arc hover:underline">
          <KeyRound size={11} /> Full audit trail
        </Link>
      </section>
    </div>
  );
}
