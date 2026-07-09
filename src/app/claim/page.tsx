import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, Database, ShieldCheck, Search } from "lucide-react";
import { getVendorById } from "@/lib/vendors";
import { getSession } from "@/lib/auth";
import { vendorLocation } from "@/lib/utils";
import { ClaimForm } from "@/components/claim-form";
import { VendorLogo } from "@/components/vendor-card";
import { ButtonLink } from "@/components/ui";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Claim your company",
  description:
    "Take ownership of your AVLpoint profile, enrich it, and climb the Trust Ladder from Listed to Level 1 Certified.",
};

const LADDER = [
  { icon: Database, label: "Listed", body: "You're already in the database." },
  { icon: BadgeCheck, label: "Claimed", body: "You own and enrich your profile." },
  { icon: ShieldCheck, label: "Verified", body: "Documents checked against registries." },
  { icon: ClipboardCheck, label: "Level 1 Certified", body: "Independent on-site inspection." },
];

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor: vendorParam } = await searchParams;
  const vendorId = Number(vendorParam);
  const [session, vendor] = await Promise.all([
    getSession(),
    Number.isFinite(vendorId) && vendorId > 0 ? getVendorById(vendorId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="anim-fade-up mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-arc">
          For vendors
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-5xl">
          Claim your company. <span className="text-gradient">Climb the ladder.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-fg-secondary">
          Your profile is probably already here. Claim it, correct it, enrich it — and every rung
          you climb moves you higher in AI search results seen by enterprise buyers.
        </p>
      </div>

      {/* Trust ladder strip */}
      <div className="anim-fade-up delay-2 mt-12 grid gap-4 sm:grid-cols-4">
        {LADDER.map((s, i) => (
          <div key={s.label} className="card p-4 text-center">
            <div
              className={`mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border ${
                i === 3
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : i === 0
                    ? "border-line-strong text-fg-secondary"
                    : "border-arc/30 bg-arc/10 text-arc"
              }`}
            >
              <s.icon size={18} />
            </div>
            <p className="font-display text-sm font-semibold text-fg">{s.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-secondary">{s.body}</p>
          </div>
        ))}
      </div>

      <Reveal className="mt-12">
        {vendor ? (
          <div className="card gradient-ring mx-auto max-w-xl p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-4 border-b border-line pb-5">
              <VendorLogo vendor={vendor} size={56} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold text-fg">
                  {vendor.company_name}
                </h2>
                <p className="truncate text-sm text-fg-secondary">{vendorLocation(vendor)}</p>
              </div>
            </div>
            {session ? (
              <ClaimForm vendorId={vendor.id} vendorName={vendor.company_name} />
            ) : (
              <div className="text-center">
                <p className="text-sm text-fg-secondary">
                  Sign in (or create a free account) to claim this profile — the claim is linked
                  to your account so only you can manage it.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <ButtonLink href={`/login?next=/claim?vendor=${vendor.id}`} variant="secondary">
                    Sign in
                  </ButtonLink>
                  <ButtonLink href="/signup">Create free account</ButtonLink>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
              <Search size={20} />
            </div>
            <h2 className="font-display text-lg font-semibold text-fg">
              First, find your company
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-secondary">
              Search the directory for your company, open its profile, and hit{" "}
              <span className="font-medium text-fg">&ldquo;Claim this company&rdquo;</span>. Not
              listed yet?{" "}
              <Link href="/contact" className="text-arc hover:underline">
                Tell us
              </Link>{" "}
              and we&apos;ll add you.
            </p>
            <ButtonLink href="/search" size="lg" className="mt-6">
              Search the directory <ArrowRight size={16} />
            </ButtonLink>
          </div>
        )}
      </Reveal>

      <p className="mt-8 text-center text-xs text-fg-muted">
        Claiming is free during early access. Verified membership and Level 1 certification are
        described on the{" "}
        <Link href="/pricing" className="text-arc hover:underline">
          pricing page
        </Link>
        .
      </p>
    </div>
  );
}
