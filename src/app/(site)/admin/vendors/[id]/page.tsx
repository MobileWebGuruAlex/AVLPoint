import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Moon, StickyNote, Sun } from "lucide-react";
import { getVendorFull } from "@/lib/admin";
import { getVendorState } from "@/lib/states";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listNotes } from "@/lib/users-admin";
import { sleepVendorAction, wakeVendorAction } from "@/lib/admin-actions";
import { addNoteAction } from "@/lib/user-actions";
import { VendorEditor } from "@/components/admin/vendor-editor";
import { ActionForm } from "@/components/action-form";
import { Badge, Input, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Edit Vendor — Admin" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminVendorDetailPage({ params }: Props) {
  const session = await getSession();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const vendor = getVendorFull(id);
  if (!vendor) notFound();

  const state = getVendorState(id);
  const sleeping = state?.state === "sleeping";
  const canSleep = session ? can(session.role, "vendors.sleep") : false;
  const canNote = session ? can(session.role, "notes.write") : false;
  const notes = listNotes("vendor", String(id));

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Vendor Editor</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            {vendor.company_name}
          </h1>
          {sleeping
            ? <Badge tone="warn"><Moon size={11} /> Sleeping</Badge>
            : <Badge tone="ok"><Sun size={11} /> Awake</Badge>}
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          ID: {vendor.id} · Last updated: {vendor.last_updated} ·{" "}
          <Link href={`/vendors/${vendor.id}`} className="text-arc hover:underline">public profile</Link>
        </p>
      </div>

      {/* Visibility control */}
      <section className={`card mb-6 p-5 ${sleeping ? "border-warn/40" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-fg">
              {sleeping ? "This vendor is sleeping" : "Visibility"}
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-fg-muted">
              {sleeping ? (
                <>
                  Hidden from search, profiles, recommendations, stats, and APIs since{" "}
                  <span className="font-mono">{state?.changed_at?.slice(0, 16)}</span>
                  {state?.changed_by ? <> by <span className="font-mono">{state.changed_by}</span></> : null}
                  {state?.reason ? <> — “{state.reason}”</> : null}. All data is intact; waking restores it everywhere instantly.
                </>
              ) : (
                "Sleeping hides a vendor from every user-facing surface without deleting anything — the reversible alternative to deletion."
              )}
            </p>
          </div>
          {canSleep && (
            sleeping ? (
              <ActionForm action={wakeVendorAction} submitLabel="Wake vendor" size="sm" variant="secondary" inline>
                <input type="hidden" name="vendor_id" value={vendor.id} />
              </ActionForm>
            ) : (
              <ActionForm action={sleepVendorAction} submitLabel="Sleep vendor" size="sm" variant="danger" inline>
                <input type="hidden" name="vendor_id" value={vendor.id} />
                <div className="w-64">
                  <Input name="reason" placeholder="Reason (kept in audit log)" className="h-8 text-xs" />
                </div>
              </ActionForm>
            )
          )}
        </div>
      </section>

      <VendorEditor vendor={vendor} />

      {/* Internal notes */}
      <section className="card mt-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <StickyNote size={15} className="text-arc" /> Internal notes
        </h2>
        {canNote && (
          <ActionForm action={addNoteAction} submitLabel="Add note" size="sm" variant="secondary" className="mb-4">
            <input type="hidden" name="entity_type" value="vendor" />
            <input type="hidden" name="entity_id" value={vendor.id} />
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
    </div>
  );
}
