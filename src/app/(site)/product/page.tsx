import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  Database,
  Fingerprint,
  Layers,
  Network,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Tilt } from "@/components/tilt";
import { Aurora } from "@/components/aurora";
import { PipelineDiagram } from "@/components/pipeline-diagram";
import { SectionHeading, ButtonLink, Badge } from "@/components/ui";
import { getStats } from "@/lib/vendors";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How AVLpoint's agentic pipeline discovers, enriches, verifies, and ranks industrial vendors.",
};

const PIPELINE = [
  {
    icon: Network,
    title: "Multi-source discovery",
    body: "Fourteen concurrent discovery workers sweep certification bodies (ASME, AISC), government registries (EPA ECHO, OpenCorporates), industry directories (ThomasNet, IQS, IndustryNet, MacRAE's, CEMA), open data (Wikidata, OpenStreetMap), and targeted web search. Every URL is deduplicated before it costs a single request.",
  },
  {
    icon: Bot,
    title: "Zero-waste AI enrichment",
    body: "Free extraction first: scraped pages are parsed for 80% of fields at no cost. Only the genuinely missing fields go to a frontier LLM — with per-vendor and per-session spend ceilings, automatic quarantine after repeated failures, and cached markdown so nothing is fetched twice.",
  },
  {
    icon: Fingerprint,
    title: "Provenance & verification",
    body: "Each field records which source produced it. Certifications link back to the issuing registry. Profiles are graded for completeness and confidence before they're marked verified.",
  },
  {
    icon: Layers,
    title: "Suitability tiering",
    body: "An AI scoring model grades every vendor into enterprise-readiness tiers using facility scale, certifications, customer evidence, and operating history — turning 85,000 raw records into a ranked shortlist.",
  },
];

const CAPABILITIES = [
  { k: "90+", v: "structured fields per vendor profile" },
  { k: "21", v: "dimensions in the ranked search index" },
  { k: "24/7", v: "continuous discovery & enrichment" },
  { k: "3", v: "enterprise-readiness tiers, auto-assigned" },
];

export default async function ProductPage() {
  const stats = await getStats();

  return (
    <div className="relative overflow-hidden">
      <Aurora />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="anim-fade-up mx-auto max-w-3xl text-center">
        <Badge tone="arc" className="mb-5">
          <Workflow size={12} /> The pipeline behind the platform
        </Badge>
        <h1 className="font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          An approved vendor list that <span className="text-gradient">builds itself</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-fg-secondary sm:text-lg">
          AVLpoint runs an autonomous data pipeline that does what a procurement research team
          does — discover, read, verify, rank — at machine scale and machine speed.
        </p>
      </div>

      {/* Live numbers */}
      <div className="anim-fade-up delay-2 mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { k: formatNumber(stats.totalVendors), v: "vendors indexed" },
          { k: formatNumber(stats.verifiedVendors), v: "verified profiles" },
          { k: formatNumber(stats.tier1Vendors), v: "tier-1 enterprise vendors" },
          { k: String(stats.sources), v: "authoritative sources" },
        ].map((s) => (
          <div key={s.v} className="card p-5 text-center">
            <p className="font-mono text-2xl font-semibold text-arc">{s.k}</p>
            <p className="mt-1 text-xs text-fg-secondary">{s.v}</p>
          </div>
        ))}
      </div>

      {/* Pipeline deep-dive */}
      <div className="mt-24 space-y-6">
        <Reveal>
          <SectionHeading
            eyebrow="Under the hood"
            title="Four stages, fully automated"
          />
        </Reveal>
        <Reveal variant="scale">
          <div className="card gradient-ring overflow-hidden p-2 sm:p-4">
            <PipelineDiagram className="h-auto w-full" />
          </div>
        </Reveal>
        {PIPELINE.map((p, i) => (
          <Reveal key={p.title} delay={i * 60} variant={i % 2 === 0 ? "left" : "right"}>
            <div className="card card-hover shine grid gap-5 p-7 md:grid-cols-[56px_1fr]">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                <p.icon size={22} />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-fg">
                  <span className="mr-3 font-mono text-sm text-arc">0{i + 1}</span>
                  {p.title}
                </h3>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-fg-secondary">
                  {p.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* AI architecture */}
      <div className="mt-24">
        <Reveal>
          <SectionHeading
            eyebrow="The brain"
            title="Claude, running on our own infrastructure"
            subtitle="One reasoning engine, one rule: every recommendation is grounded in database records and explains itself."
          />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              title: "Grounded, never generative",
              body: "Retrieval happens in our index; Claude only reranks and explains the candidates it's given. Reasons cite database fields — invented facts are rejected at the parser.",
            },
            {
              title: "Swappable by design",
              body: "The model lives behind a single config constant. Reasoning runs on Claude Sonnet; high-volume trivia drops to a budget tier. No vendor lock-in, no rewrite to switch.",
            },
            {
              title: "Costs stay flat",
              body: "Self-hosted deployment, cached retrieval, spend ceilings, and the zero-waste protocol mean AI cost scales with questions asked — not with database size.",
            },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <Tilt className="h-full" bodyClassName="h-full rounded-2xl">
                <div className="card h-full p-6">
                  <p className="font-mono text-xs text-arc">0{i + 1}</p>
                  <h3 className="mt-3 font-display text-lg font-semibold text-fg">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{f.body}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Capability strip */}
      <Reveal className="mt-24" variant="scale">
        <div className="card gradient-ring relative overflow-hidden p-8">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative grid gap-8 text-center sm:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <div key={c.v}>
                <p className="font-mono text-3xl font-semibold text-fg">{c.k}</p>
                <p className="mx-auto mt-1.5 max-w-40 text-xs leading-relaxed text-fg-secondary">
                  {c.v}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Why it matters */}
      <div className="mt-24 grid gap-5 md:grid-cols-3">
        {[
          {
            icon: Database,
            title: "One record per vendor",
            body: "Aggressive dedupe and merge logic collapses directory noise into a single, provenance-tracked profile.",
          },
          {
            icon: ShieldCheck,
            title: "Trust you can audit",
            body: "Verification status, confidence grades, and field-level sourcing are first-class data — not marketing claims.",
          },
          {
            icon: CircleDollarSign,
            title: "Costs that stay flat",
            body: "The zero-waste protocol means AI spend scales with missing data, not database size.",
          },
        ].map((f, i) => (
          <Reveal key={f.title} delay={i * 80}>
            <div className="card card-hover h-full p-6">
              <f.icon size={20} className="text-arc" />
              <h3 className="mt-4 font-display text-lg font-semibold text-fg">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-24 text-center">
        <ButtonLink href="/search" size="lg" className="shine">
          Search the live database <ArrowRight size={16} />
        </ButtonLink>
      </Reveal>
      </div>
    </div>
  );
}
