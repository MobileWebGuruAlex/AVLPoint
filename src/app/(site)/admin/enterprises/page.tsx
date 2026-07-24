import type { Metadata } from "next";
import { Building2, Moon, PlusCircle, ShieldAlert, Sun } from "lucide-react";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listOrgsAdmin, listOrgMembers, listAuditRequests } from "@/lib/platform";
import {
  setOrgStatusAction, createOrgAdminAction, addOrgMemberAdminAction,
} from "@/lib/user-actions";
import { ActionForm } from "@/components/action-form";
import { Badge, Input, Label } from "@/components/ui";

export const metadata: Metadata = { title: "Enterprises — Admin" };

export default async function AdminEnterprisesPage() {
  const session = await getSession();
  if (!session || !can(session.role, "orgs.view")) return null;
  const canManage = can(session.role, "orgs.manage");

  const orgs = listOrgsAdmin();
  const audits = listAuditRequests();
  const sleeping = orgs.filter((o) => o.status === "sleeping").length;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Enterprise Accounts</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">Workspaces</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {orgs.length} workspace{orgs.length === 1 ? "" : "s"} · {sleeping} sleeping
        </p>
      </div>

      {/* Workspace cards */}
      {orgs.length === 0 ? (
        <div className="card p-10 text-center">
          <Building2 size={24} className="mx-auto text-fg-muted" />
          <p className="mt-3 text-sm text-fg-secondary">No enterprise workspaces yet.</p>
          <p className="mt-1 text-xs text-fg-muted">Create one below or let a customer self-serve from /sandbox.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orgs.map((org) => {
            const members = listOrgMembers(org.id);
            const sleepingOrg = org.status === "sleeping";
            return (
              <section key={org.id} className={`card p-5 ${sleepingOrg ? "opacity-75" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-base font-semibold text-fg">{org.name}</h2>
                      {sleepingOrg
                        ? <Badge tone="warn"><Moon size={11} /> Sleeping</Badge>
                        : <Badge tone="ok">Active</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-fg-muted">
                      {org.owner_email ?? "no owner"} · created {org.created_at?.slice(0, 10)} ·
                      {" "}{org.member_count} member{org.member_count === 1 ? "" : "s"} ·
                      {" "}{org.private_vendor_count} private vendors · {org.audit_request_count} audit requests
                    </p>
                  </div>
                  {canManage && (
                    sleepingOrg ? (
                      <ActionForm action={setOrgStatusAction} submitLabel="Wake workspace" size="sm" variant="secondary" inline>
                        <input type="hidden" name="org_id" value={org.id} />
                        <input type="hidden" name="status" value="active" />
                      </ActionForm>
                    ) : (
                      <ActionForm action={setOrgStatusAction} submitLabel="Sleep workspace" size="sm" variant="danger" inline>
                        <input type="hidden" name="org_id" value={org.id} />
                        <input type="hidden" name="status" value="sleeping" />
                      </ActionForm>
                    )
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <Badge key={m.email} tone={m.role === "admin" ? "arc" : "neutral"}>
                      {m.email}{m.role === "admin" ? " · admin" : ""}
                    </Badge>
                  ))}
                </div>

                {canManage && !sleepingOrg && (
                  <div className="mt-4 border-t border-line pt-4">
                    <ActionForm action={addOrgMemberAdminAction} submitLabel="Add member" size="sm" variant="ghost" inline>
                      <input type="hidden" name="org_id" value={org.id} />
                      <div className="w-64">
                        <Input name="email" type="email" required placeholder="member@company.com" className="h-8 text-xs" />
                      </div>
                    </ActionForm>
                  </div>
                )}
                {sleepingOrg && (
                  <p className="mt-3 text-[11px] text-fg-muted">
                    Members can still sign in and read their data, but workspace writes (uploads, invitations, audit requests) are paused. Waking restores everything.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Create workspace */}
      {canManage && (
        <section className="card max-w-xl p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-fg">
            <PlusCircle size={15} className="text-arc" /> Create workspace
          </h2>
          <p className="mb-4 text-xs text-fg-muted">
            For white-glove onboarding. The owner must already have an AVLpoint account (create or invite them first).
          </p>
          <ActionForm action={createOrgAdminAction} submitLabel="Create workspace" size="sm" variant="secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="org-name">Workspace name</Label>
                <Input id="org-name" name="name" required placeholder="Acme Procurement" />
              </div>
              <div>
                <Label htmlFor="org-owner">Owner email</Label>
                <Input id="org-owner" name="owner_email" type="email" required placeholder="owner@company.com" />
              </div>
            </div>
          </ActionForm>
        </section>
      )}

      {/* Audit requests */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <ShieldAlert size={15} className="text-arc" /> Enterprise audit requests ({audits.length})
        </h2>
        {audits.length === 0 && <p className="text-sm italic text-fg-muted">None open.</p>}
        <ul className="space-y-2">
          {audits.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5 text-sm">
              <div>
                <span className="text-fg">{a.company_name ?? `Vendor #${a.vendor_id}`}</span>
                {a.note && <p className="mt-0.5 text-xs text-fg-muted">{a.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="warn">{a.status}</Badge>
                <span className="font-mono text-[10px] text-fg-muted">{a.created_at?.slice(0, 10)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {!canManage && (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <Sun size={13} /> You have read-only access to workspaces.
        </p>
      )}
    </div>
  );
}
