import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Bot, Braces, Compass, Database, Scale, ShieldCheck, Workflow } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { SectionHeading, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Guides and reference for the AVLpoint platform and API.",
};

const SECTIONS = [
  {
    icon: Compass,
    title: "Getting started",
    ready: true,
    items: [
      { label: "Your first vendor search", href: "/search" },
      { label: "Understanding verified profiles", href: "/faq" },
      { label: "Building a shortlist", href: "/dashboard" },
    ],
  },
  {
    icon: Database,
    title: "The data model",
    ready: true,
    items: [
      { label: "Vendor profile fields", href: "/product" },
      { label: "Enterprise tiers & suitability scores", href: "/faq" },
      { label: "Provenance & confidence grades", href: "/product" },
    ],
  },
  {
    icon: Workflow,
    title: "The pipeline",
    ready: true,
    items: [
      { label: "Discovery sources", href: "/product" },
      { label: "AI enrichment & zero-waste protocol", href: "/product" },
      { label: "Verification & quality gates", href: "/faq" },
    ],
  },
  {
    icon: Braces,
    title: "API reference",
    ready: false,
    items: [
      { label: "Authentication", href: "/contact" },
      { label: "Search endpoint", href: "/contact" },
      { label: "Vendor profile endpoint", href: "/contact" },
    ],
  },
  {
    icon: Bot,
    title: "Architecture & AI",
    ready: true,
    items: [
      { label: "Claude on our own infrastructure", href: "/product" },
      { label: "Grounded, explained recommendations", href: "/product" },
      { label: "Swappable model configuration", href: "/product" },
    ],
  },
  {
    icon: ShieldCheck,
    title: "For vendors",
    ready: true,
    items: [
      { label: "Claiming your profile", href: "/claim" },
      { label: "The Trust Ladder", href: "/claim" },
      { label: "Correcting your data", href: "/do-not-sell" },
    ],
  },
  {
    icon: Scale,
    title: "Legal & privacy",
    ready: true,
    items: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Do Not Sell / removal requests", href: "/do-not-sell" },
    ],
  },
  {
    icon: BookOpen,
    title: "Account & billing",
    ready: true,
    items: [
      { label: "Plans & seats", href: "/pricing" },
      { label: "Managing your account", href: "/settings" },
      { label: "Exports", href: "/pricing" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal>
        <SectionHeading
          center
          eyebrow="Documentation"
          title="Learn the platform"
          subtitle="Guides for buyers, vendors, and developers. API docs ship with Enterprise access."
        />
      </Reveal>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s, i) => (
          <Reveal key={s.title} delay={(i % 3) * 80}>
            <div className="card card-hover h-full p-6">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                  <s.icon size={18} />
                </div>
                {!s.ready && <Badge tone="warn">Coming soon</Badge>}
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-fg">{s.title}</h2>
              <ul className="mt-3 space-y-2">
                {s.items.map((it) => (
                  <li key={it.label}>
                    <Link
                      href={it.href}
                      className="group flex items-center gap-1.5 text-sm text-fg-secondary transition-colors hover:text-arc"
                    >
                      {it.label}
                      <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
