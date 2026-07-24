import type { Metadata } from "next";
import Link from "next/link";
import { Award, ClipboardCheck, HardHat, PauseCircle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  listInspectors, listInspectionRequestsFor, listCertificationsAdmin,
} from "@/lib/platform";
import { setInspectorStatusAction, revokeCertificationAction } from "@/lib/user-actions";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Inspectors — Admin" };

const STATUS_TONE: Record<string, "arc" | "ok" | "warn" | "neutral"> = {
  approved: "ok", pending: "arc", suspended: "warn",
  requested: "arc", quoted: "arc", scheduled: "arc", in_progress: "warn",
  passed: "ok", failed: "warn",
};

export default async function AdminInspectorsPage() {
  const session = await getSession();
  if (!session || !can(session.role, "inspectors.view")) return null;
  const canManage = can(session.role, "inspectors.manage");

  const inspectors = listInspectors(false);
  const requests = listInspectionRequestsFor(session.userId, true);
  const certifications = listCertificationsAdmin();

  const pending = inspectors.filter((i) => i.status === "pending");
  const active = inspectors.filter((i) => i.status === "approved");
  const suspended = inspectors.filter((i) => i.status === "suspended");

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Inspection Network</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">Inspectors</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {active.length} listed · {pending.length} awaiting review · {suspended.length} suspended ·
          {" "}{certifications.length} certifications issued
        </p>
      </div>

      {/* Inspector roster */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <HardHat size={15} className="text-arc" /> Roster
        </h2>
        <div className="space-y-2">
          {inspectors.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm font-semibold text-fg">{i.company}</p>
                  {i.house === 1 && <Badge tone="arc">House team</Badge>}
                  <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>{i.status}</Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-fg-muted">
                  {[i.credentials, i.regions, i.base_price].filter(Boolean).join(" · ") || "No details provided"}
                </p>
              </div>
              {canManage && i.house !== 1 && (
                <div className="flex gap-2">
                  {i.status !== "approved" && (
                    <ActionForm action={setInspectorStatusAction} submitLabel="Approve" size="sm" variant="secondary" inline>
                      <input type="hidden" name="inspector_id" value={i.id} />
                      <input type="hidden" name="status" value="approved" />
                    </ActionForm>
                  )}
                  {i.status === "approved" && (
                    <ActionForm action={setInspectorStatusAction} submitLabel="Suspend" size="sm" variant="danger" inline>
                      <input type="hidden" name="inspector_id" value={i.id} />
                      <input type="hidden" name="status" value="suspended" />
                    </ActionForm>
                  )}
                  {i.status === "suspended" && (
                    <ActionForm action={setInspectorStatusAction} submitLabel="Reinstate" size="sm" variant="secondary" inline>
                      <input type="hidden" name="inspector_id" value={i.id} />
                      <input type="hidden" name="status" value="approved" />
                    </ActionForm>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-muted">
          <PauseCircle size={12} />
          Suspended inspectors disappear from the public marketplace immediately but keep their history; reinstating restores them.
        </p>
      </section>

      {/* Inspection pipeline */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <ClipboardCheck size={15} className="text-arc" /> Inspection pipeline ({requests.length})
        </h2>
        {requests.length === 0 && <p className="text-sm italic text-fg-muted">No inspection requests yet.</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/admin/vendors/${r.vendor_id}`} className="font-medium text-fg hover:text-arc">
                  {r.vendor_name ?? `Vendor #${r.vendor_id}`}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-fg-muted">
                  {r.company ?? "unassigned"} · {r.quote ? `quote ${r.quote}` : "no quote"} ·
                  {" "}{r.scheduled_for ? `scheduled ${r.scheduled_for}` : "unscheduled"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace("_", " ")}</Badge>
                <span className="font-mono text-[10px] text-fg-muted">{r.created_at?.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-fg-muted">
          Status transitions (quote → schedule → report) are driven from the{" "}
          <Link href="/inspections/requests" className="text-arc hover:underline">inspections workspace</Link>{" "}
          by the assigned inspector or an ops admin.
        </p>
      </section>

      {/* Certifications */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <Award size={15} className="text-arc" /> Level 1 certifications ({certifications.length})
        </h2>
        {certifications.length === 0 && <p className="text-sm italic text-fg-muted">None issued yet — certifications are created automatically when an inspection passes.</p>}
        <div className="space-y-2">
          {certifications.map((c) => {
            const expired = new Date(c.expires_at) < new Date();
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5 text-sm">
                <div>
                  <Link href={`/admin/vendors/${c.vendor_id}`} className="font-medium text-fg hover:text-arc">
                    {c.company_name ?? `Vendor #${c.vendor_id}`}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">
                    {c.level} · issued {c.issued_at?.slice(0, 10)} · expires {c.expires_at}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={expired ? "warn" : "ok"}>{expired ? "expired" : "valid"}</Badge>
                  {canManage && !expired && (
                    <ActionForm action={revokeCertificationAction} submitLabel="Revoke" size="sm" variant="danger" inline>
                      <input type="hidden" name="cert_id" value={c.id} />
                    </ActionForm>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
