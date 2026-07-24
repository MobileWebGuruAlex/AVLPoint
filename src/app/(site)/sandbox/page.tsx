import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Users, Database, Search, ShieldCheck, FileSearch } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getOrgForUser, listPrivateVendors, listOrgMembers, listAuditRequests } from "@/lib/platform";
import { createOrgAction, addMemberAction, requestAuditAction } from "@/lib/platform-actions";
import { searchVendors } from "@/lib/vendors";
import { jsonList, vendorLocation, truncate } from "@/lib/utils";
import { IngestUploader } from "@/components/ingest-uploader";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { Aurora } from "@/components/aurora";

export const metadata: Metadata = {
  title: "Enterprise Sandbox",
  description: "Your private AVL workspace: ingest legacy vendor lists, search them alongside the AVLpoint network, and request audits.",
};

export default async function SandboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { q } = await searchParams;
  const org = getOrgForUser(session.userId);

  if (!org) {
    return (
      <div className="relative overflow-hidden">
        <Aurora />
        <div className="relative mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-arc/25 bg-arc/10 text-arc">
            <Building2 size={22} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Create your <span className="text-gradient">private sandbox</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-fg-secondary">
            An isolated workspace for your organization. Upload your legacy AVL in any form,
            search it together with the AVLpoint network, and never share a byte with anyone else.
          </p>
          <div className="card gradient-ring mx-auto mt-8 p-6 text-left">
            <ActionForm action={createOrgAction} submitLabel="Create workspace">
              <div>
                <Label htmlFor="name">Organization name</Label>
                <Input id="name" name="name" required placeholder="e.g. Gulf Coast Refining Co." />
              </div>
            </ActionForm>
          </div>
        </div>
      </div>
    );
  }

  const [privateVendors, members, audits, combined] = [
    listPrivateVendors(org.id),
    listOrgMembers(org.id),
    listAuditRequests(org.id),
    q ? await searchVendors({ q, sort: "relevance", page: 1 }) : null,
  ];
  const privateMatches = q ? listPrivateVendors(org.id, q) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Enterprise sandbox</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg">{org.name}</h1>
          <p className="mt-1 font-mono text-xs text-fg-muted">
            {privateVendors.length} private vendors · isolated workspace · never shared, never trained on
          </p>
        </div>
        <Badge tone="arc"><Users size={11} /> {members.length} member{members.length === 1 ? "" : "s"}</Badge>
      </div>

      {/* Combined search */}
      <section className="card gradient-ring mb-8 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <Search size={17} className="text-arc" /> Unified search, honestly labeled
        </h2>
        <p className="mb-4 text-sm text-fg-secondary">
          One query searches your private AVL and the AVLpoint network — results always labeled.
        </p>
        <form method="get" className="flex gap-2">
          <Input name="q" defaultValue={q ?? ""} placeholder="e.g. pressure vessel fabricator ASME" className="max-w-lg" />
          <button type="submit" className="h-10 cursor-pointer rounded-[10px] bg-gradient-to-r from-arc to-arc-deep px-5 text-sm font-semibold text-arc-ink transition-all hover:brightness-110">
            Search
          </button>
        </form>

        {q && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ok">
                On your AVL · approved ({privateMatches.length})
              </p>
              <div className="space-y-2">
                {privateMatches.length === 0 && (
                  <p className="text-sm italic text-fg-muted">No matches on your private AVL — a coverage gap.</p>
                )}
                {privateMatches.map((v) => (
                  <div key={v.id} className="rounded-xl border border-ok/25 bg-ok/5 px-4 py-3">
                    <p className="font-display text-sm font-semibold text-fg">{v.name}</p>
                    <p className="mt-0.5 text-xs text-fg-secondary">
                      {[v.location, v.capabilities && truncate(v.capabilities, 60)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-arc">
                AVLpoint network · not on your list ({combined?.vendors.length ?? 0} of {combined?.total ?? 0})
              </p>
              <div className="space-y-2">
                {combined?.vendors.slice(0, 5).map((v) => (
                  <div key={v.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/vendors/${v.id}`} className="min-w-0 truncate font-display text-sm font-semibold text-fg hover:text-arc">
                        {v.company_name}
                        {v.completeness_status === "verified" && <ShieldCheck size={12} className="ml-1.5 inline text-arc" />}
                      </Link>
                      <ActionForm action={requestAuditAction} submitLabel="Request audit" size="sm" variant="secondary" inline>
                        <input type="hidden" name="vendor_id" value={v.id} />
                      </ActionForm>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fg-secondary">
                      {vendorLocation(v)} · {jsonList(v.certifications_held).slice(0, 3).join(", ") || v.primary_business_type}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          {/* Ingest */}
          <Reveal>
            <section className="card p-6">
              <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-fg">
                <FileSearch size={17} className="text-arc" /> AVL ingest — photo to database
              </h2>
              <p className="mb-4 text-sm text-fg-secondary">
                No matter how old the format, it comes alive here.
              </p>
              <IngestUploader />
            </section>
          </Reveal>

          {/* Private vendors */}
          <Reveal>
            <section className="card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
                <Database size={17} className="text-arc" /> Your private AVL ({privateVendors.length})
              </h2>
              {privateVendors.length === 0 ? (
                <p className="text-sm italic text-fg-muted">Nothing yet — ingest your first list above.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                      <tr>{["Company", "Capabilities", "Location", "Source"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {privateVendors.map((v) => (
                        <tr key={v.id} className="border-t border-line">
                          <td className="px-3 py-2 font-medium text-fg">{v.name}</td>
                          <td className="px-3 py-2 text-fg-secondary">{truncate(v.capabilities ?? "", 50)}</td>
                          <td className="px-3 py-2 text-fg-secondary">{v.location}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-fg-muted">{truncate(v.source_file ?? "", 20)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Reveal>
        </div>

        <div className="space-y-8">
          {/* Team */}
          <Reveal>
            <section className="card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-fg">
                <Users size={16} className="text-arc" /> Team
              </h2>
              <ul className="mb-4 space-y-1.5">
                {members.map((m) => (
                  <li key={m.email} className="flex items-center justify-between text-sm text-fg-secondary">
                    <span className="truncate">{m.email}</span>
                    <span className="font-mono text-[10px] uppercase text-fg-muted">{m.role}</span>
                  </li>
                ))}
              </ul>
              {org.role === "admin" && (
                <ActionForm action={addMemberAction} submitLabel="Add" size="sm" variant="secondary" inline>
                  <Input name="email" type="email" placeholder="teammate@company.com" className="!h-8 max-w-52 text-xs" />
                </ActionForm>
              )}
            </section>
          </Reveal>

          {/* Audit requests */}
          <Reveal>
            <section className="card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-fg">
                <ShieldCheck size={16} className="text-arc" /> Audit requests
              </h2>
              {audits.length === 0 ? (
                <p className="text-sm italic text-fg-muted">
                  None yet. Find a network vendor above and request an audit to onboard them.
                </p>
              ) : (
                <ul className="space-y-2">
                  {audits.map((a) => (
                    <li key={a.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="font-medium text-fg">{a.company_name ?? `Vendor #${a.vendor_id}`}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase text-warn">{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
