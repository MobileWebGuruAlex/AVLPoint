import type { Metadata } from "next";
import { Check, Sparkles } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Tilt } from "@/components/tilt";
import { Aurora } from "@/components/aurora";
import { SectionHeading, ButtonLink, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for teams of every size. Start free, upgrade when your team does.",
};

const PLANS = [
  {
    name: "Explorer",
    price: "$0",
    period: "forever",
    tagline: "For individual buyers evaluating the database.",
    cta: { href: "/signup", label: "Start free" },
    highlight: false,
    features: [
      "Full-text search across all vendors",
      "25 full profile views per month",
      "Basic filters (location, type)",
      "Personal shortlist (up to 20 vendors)",
    ],
  },
  {
    name: "Professional",
    price: "$149",
    period: "per seat / month",
    tagline: "For procurement teams building approved vendor lists.",
    cta: { href: "/signup", label: "Start 14-day trial" },
    highlight: true,
    features: [
      "Unlimited profile views & search",
      "All filters incl. certifications & tiers",
      "AI recommendations & suitability scores",
      "Unlimited shortlists with team sharing",
      "Field-level provenance & confidence data",
      "CSV / AVL export",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "annual agreement",
    tagline: "For organizations integrating vendor intelligence at scale.",
    cta: { href: "/contact", label: "Talk to sales" },
    highlight: false,
    features: [
      "Everything in Professional",
      "API access to the vendor database",
      "Custom discovery sources & regions",
      "SSO / SAML and role-based access",
      "Dedicated success engineer",
      "SLA-backed uptime & support",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="relative">
      <Aurora core={false} />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal>
        <SectionHeading
          center
          eyebrow="Pricing"
          title="Start free. Scale when your team does."
          subtitle="Every plan searches the same live database of 85,000+ industrial vendors. No setup fees, cancel anytime."
        />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 90} variant={i === 0 ? "left" : i === 2 ? "right" : "up"}>
            <Tilt className="h-full" bodyClassName={cn("h-full", plan.highlight ? "rounded-2xl" : "rounded-2xl")}>
            <div
              className={cn(
                "card relative flex h-full flex-col p-7",
                plan.highlight && "gradient-ring border-arc/50 shadow-[0_0_50px_-12px_var(--glow)]"
              )}
            >
              {plan.highlight && (
                <Badge tone="arc" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Sparkles size={11} /> Most popular
                </Badge>
              )}
              <h2 className="font-display text-lg font-semibold text-fg">{plan.name}</h2>
              <p className="mt-1 text-sm text-fg-secondary">{plan.tagline}</p>
              <p className="mt-5">
                <span className="font-display text-4xl font-bold text-fg">{plan.price}</span>
                <span className="ml-2 text-sm text-fg-muted">{plan.period}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-fg-secondary">
                    <Check size={15} className="mt-0.5 shrink-0 text-arc" />
                    {f}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href={plan.cta.href}
                variant={plan.highlight ? "primary" : "secondary"}
                className={cn("mt-7 w-full", plan.highlight && "shine")}
              >
                {plan.cta.label}
              </ButtonLink>
            </div>
            </Tilt>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-16" variant="scale">
        <div className="card gradient-ring mx-auto max-w-3xl p-7 text-center">
          <h3 className="font-display text-lg font-semibold text-fg">
            Vendors: claim your profile, climb the Trust Ladder
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-fg-secondary">
            If your company is in the database, claim it — correct details, add capabilities, and
            progress from Listed to Claimed, Verified, and Level 1 Certified. Each rung raises
            your placement in AI search results seen by enterprise buyers. Claiming is free
            during early access; verified membership pricing will be announced before it applies.
          </p>
          <ButtonLink href="/claim" variant="secondary" size="sm" className="mt-5">
            Claim your company
          </ButtonLink>
        </div>
      </Reveal>

      <p className="mt-10 text-center font-mono text-xs text-fg-muted">
        Recommendation transparency: paid placement is always labeled. Rankings stay relevance-first.
      </p>
      </div>
    </div>
  );
}
