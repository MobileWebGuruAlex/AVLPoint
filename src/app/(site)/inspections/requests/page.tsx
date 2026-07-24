import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listInspectionRequestsFor, isAdminSession, listInspectors } from "@/lib/platform";
import { advanceInspectionAction, fileReportAction } from "@/lib/platform-actions";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Textarea, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Inspection pipeline" };

const STATUS_TONE: Record<string, "arc" | "ok" | "warn" | "neutral"> = {
  requested: "warn", quoted: "arc", scheduled: "arc", in_progress: "arc", passed: "ok", failed: "neutral",
};

const CHECKLIST = [
  ["facility", "Facility & housekeeping"],
  ["equipment", "Equipment matches stated capabilities"],
  ["weld_qa", "Weld / QA procedures in place"],
  ["documentation", "Document control & traceability"],
  ["certifications", "Certifications sighted & current"],
  ["safety", "Safety program in effect"],
] as const;

export default async function InspectionRequestsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const admin = isAdminSession(session);
  const requests = listInspectionRequestsFor(session.userId, admin);
  const myInspectorIds = new Set(
    listInspectors(false)
      .filter((i) => i.user_id === session.userId || (i.house === 1 && admin))
      .map((i) => i.id)
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Certification workflow</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg">Inspection pipeline</h1>
      <p className="mt-2 text-sm text-fg-secondary">
        requested → quoted → scheduled → in progress → passed / failed. A pass issues the Level 1 badge automatically.
      </p>

      <div className="mt-8 space-y-5">
        {requests.length === 0 && (
          <div className="card p-8 text-center">
            <ClipboardCheck size={22} className="mx-auto mb-3 text-fg-muted" />
            <p className="text-sm text-fg-secondary">
              No inspections yet — start one from the{" "}
              <Link href="/inspections" className="text-arc hover:underline">marketplace</Link>.
            </p>
          </div>
        )}
        {requests.map((r) => {
          const actor = myInspectorIds.has(r.inspector_id ?? "") || admin;
          return (
            <div key={r.id} className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/vendors/${r.vendor_id}`} className="font-display text-lg font-semibold text-fg hover:text-arc">
                    {r.vendor_name ?? `Vendor #${r.vendor_id}`}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">
                    {r.company ?? "Unassigned"} · opened {r.created_at?.slice(0, 10)}
                    {r.quote ? ` · quote ${r.quote}` : ""}{r.scheduled_for ? ` · scheduled ${r.scheduled_for}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace("_", " ")}</Badge>
              </div>

              {actor && (r.status === "requested" || r.status === "quoted" || r.status === "scheduled") && (
                <div className="mt-4 border-t border-line pt-4">
                  {r.status === "requested" && (
                    <ActionForm action={advanceInspectionAction} submitLabel="Send quote" size="sm" variant="secondary" inline>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="next" value="quoted" />
                      <div>
                        <Label className="!text-xs">Quote</Label>
                        <Input name="quote" placeholder="$5,000" className="!h-8 max-w-32 text-xs" />
                      </div>
                    </ActionForm>
                  )}
                  {r.status === "quoted" && (
                    <ActionForm action={advanceInspectionAction} submitLabel="Mark scheduled" size="sm" variant="secondary" inline>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="next" value="scheduled" />
                      <div>
                        <Label className="!text-xs">Date</Label>
                        <Input name="scheduled_for" type="date" className="!h-8 max-w-40 text-xs" />
                      </div>
                    </ActionForm>
                  )}
                  {r.status === "scheduled" && (
                    <ActionForm action={advanceInspectionAction} submitLabel="Start on-site inspection" size="sm" variant="secondary" inline>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="next" value="in_progress" />
                    </ActionForm>
                  )}
                </div>
              )}

              {actor && r.status === "in_progress" && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-arc">
                    Field checklist — complete on site
                  </p>
                  <ActionForm action={fileReportAction} submitLabel="File report">
                    <input type="hidden" name="request_id" value={r.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CHECKLIST.map(([key, label]) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg has-checked:border-ok/50 has-checked:bg-ok/10">
                          <input type="checkbox" name={`chk_${key}`} className="accent-(--ok)" /> {label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <Label className="!text-xs">Findings & photo evidence notes</Label>
                      <Textarea name="notes" rows={3} placeholder="Observations, serial numbers, photo references…" />
                    </div>
                    <div className="flex gap-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok has-checked:ring-1 has-checked:ring-ok">
                        <input type="radio" name="outcome" value="passed" defaultChecked className="accent-(--ok)" /> Pass — issue Level 1
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                        <input type="radio" name="outcome" value="failed" className="accent-(--danger)" /> Fail
                      </label>
                    </div>
                  </ActionForm>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
