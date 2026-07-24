import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, MapPin, BadgeDollarSign, Award } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listInspectors } from "@/lib/platform";
import { applyInspectorAction, requestInspectionAction } from "@/lib/platform-actions";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Badge, SectionHeading } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { Aurora } from "@/components/aurora";

export const metadata: Metadata = {
  title: "Inspection Marketplace",
  description: "Choose any approved inspector — ours or a third party — to take a vendor to Level 1 Certified.",
};

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; inspector?: string }>;
}) {
  const session = await getSession();
  const inspectors = listInspectors();
  const sp = await searchParams;
  const prefillVendor = sp.vendor && /^\d+$/.test(sp.vendor) ? sp.vendor : "";

  return (
    <div className="relative overflow-hidden">
      <Aurora core={false} />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <SectionHeading
            center
            eyebrow="Trust, inspected"
            title="The Inspection Marketplace"
            subtitle="Level 1 Certification requires an independent on-site inspection. Choose any approved inspector — our house team and third parties are presented on equal footing, always."
          />
        </Reveal>

        {/* Inspector directory */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {inspectors.map((ins, i) => (
            <Reveal key={ins.id} delay={i * 80}>
              <div className={`card h-full p-6 ${ins.house ? "gradient-ring" : ""}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                    <ClipboardCheck size={18} />
                  </span>
                  {ins.house ? <Badge tone="arc">House team</Badge> : <Badge tone="neutral">Independent</Badge>}
                </div>
                <Link href={`/inspectors/${ins.id}`} className="font-display text-lg font-semibold text-fg transition-colors hover:text-arc">
                  {ins.company}
                </Link>
                {ins.credentials && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-fg-secondary">
                    <Award size={12} className="mt-0.5 shrink-0 text-arc" /> {ins.credentials}
                  </p>
                )}
                {ins.regions && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-fg-secondary">
                    <MapPin size={12} className="mt-0.5 shrink-0 text-fg-muted" /> {ins.regions}
                  </p>
                )}
                {ins.base_price && (
                  <p className="mt-1 flex items-start gap-1.5 font-mono text-xs text-fg-muted">
                    <BadgeDollarSign size={12} className="mt-0.5 shrink-0" /> {ins.base_price}
                  </p>
                )}
                <Link href={`/inspectors/${ins.id}`} className="mt-3 inline-block text-xs text-arc hover:underline">
                  View full profile →
                </Link>
                {session && (
                  <div className="mt-4 border-t border-line pt-4">
                    <ActionForm action={requestInspectionAction} submitLabel="Request inspection" size="sm" variant="secondary">
                      <input type="hidden" name="inspector_id" value={ins.id} />
                      <div>
                        <Label className="!text-xs">Vendor ID (from the profile URL, e.g. /vendors/1234)</Label>
                        <Input name="vendor_id" required placeholder="1234" defaultValue={prefillVendor} className="!h-8 text-xs" />
                      </div>
                    </ActionForm>
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {!session && (
          <p className="mt-8 text-center text-sm text-fg-secondary">
            <Link href="/login" className="text-arc hover:underline">Sign in</Link> to request an inspection.
          </p>
        )}

        {/* How it works + fee transparency */}
        <Reveal className="mt-16">
          <div className="card mx-auto max-w-3xl p-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">How it works</p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fg-secondary">
              Request → quote → schedule → on-site inspection with a photo-evidence checklist →
              pass issues a dated <span className="text-ok">Level 1 Certified</span> badge with a 12-month expiry
              and renewal reminders. Third-party jobs carry a 15% platform fee; house jobs don&apos;t.
              You can always choose any approved inspector — the AI never steers toward ours without saying so.
            </p>
          </div>
        </Reveal>

        {/* Inspector application */}
        {session && (
          <Reveal className="mt-10">
            <div className="card mx-auto max-w-xl p-6">
              <h2 className="mb-1 font-display text-lg font-semibold text-fg">List your inspection company</h2>
              <p className="mb-4 text-sm text-fg-secondary">
                Credentials are reviewed manually before listing — badge integrity is the product.
              </p>
              <ActionForm action={applyInspectorAction} submitLabel="Apply to join the marketplace">
                <div>
                  <Label htmlFor="company">Company *</Label>
                  <Input id="company" name="company" required placeholder="Meridian Inspection Services" />
                </div>
                <div>
                  <Label htmlFor="credentials">Credentials</Label>
                  <Input id="credentials" name="credentials" placeholder="AWS CWI, API 510, NACE…" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="regions">Coverage regions</Label>
                    <Input id="regions" name="regions" placeholder="Texas, Louisiana…" />
                  </div>
                  <div>
                    <Label htmlFor="base_price">Base pricing</Label>
                    <Input id="base_price" name="base_price" placeholder="From $4,500" />
                  </div>
                </div>
              </ActionForm>
            </div>
          </Reveal>
        )}

        <p className="mt-10 text-center">
          <Link href="/inspections/requests" className="font-mono text-xs text-arc hover:underline">
            → view my inspection pipeline
          </Link>
        </p>
      </div>
    </div>
  );
}
