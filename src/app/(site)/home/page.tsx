// AVLpoint home — the main site entry after the cinematic landing at "/".
import Link from "next/link";
import {
  Bot,
  FileSearch,
  Fingerprint,
  Gauge,
  Radar,
  ShieldCheck,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Database,
} from "lucide-react";
import { HeroCanvas } from "@/components/hero-canvas";
import { SearchBar } from "@/components/search-bar";
import { SearchConsole } from "@/components/search-console";
import { PipelineDiagram } from "@/components/pipeline-diagram";
import { StatCounter } from "@/components/stat-counter";
import { Reveal } from "@/components/reveal";
import { Tilt } from "@/components/tilt";
import { Magnetic } from "@/components/magnetic";
import { Aurora } from "@/components/aurora";
import { SectionHeading, ButtonLink, Badge } from "@/components/ui";
import { VendorCard } from "@/components/vendor-card";
import { getStats, getFeaturedVendors } from "@/lib/vendors";

const SOURCES = [
  "ThomasNet", "ASME", "AISC", "EPA ECHO", "OpenCorporates", "Wikidata",
  "OpenStreetMap", "IQS Directory", "MacRAE's", "IndustryNet", "CEMA",
  "The Fabricator", "Nimbleway", "Web Discovery",
];

const FEATURES = [
  {
    icon: Bot,
    title: "Agentic AI enrichment",
    body: "Autonomous agents read every vendor's website, extract 90+ structured fields, and write plain-English capability summaries — continuously, not quarterly.",
  },
  {
    icon: Radar,
    title: "14-source discovery",
    body: "Vendors surface from certification bodies, government registries, industry directories, and the open web — then get deduplicated into one clean record.",
  },
  {
    icon: ShieldCheck,
    title: "Verified certifications",
    body: "ASME stamps, AISC certification, AWS qualifications, and ISO registrations traced to the issuing registry, not self-reported marketing copy.",
  },
  {
    icon: Fingerprint,
    title: "Field-level provenance",
    body: "Every data point carries its source. See exactly where a phone number, facility size, or certification claim came from before you rely on it.",
  },
  {
    icon: Gauge,
    title: "Enterprise suitability scoring",
    body: "AI grades each vendor into readiness tiers using facility scale, certifications, customer evidence, and operating history — so shortlists start pre-ranked.",
  },
  {
    icon: FileSearch,
    title: "Full-text intelligence search",
    body: "Search across summaries, capabilities, equipment lists, and 21 indexed dimensions with ranked relevance — in milliseconds, across the entire database.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Discover",
    body: "Autonomous crawlers sweep 14 authoritative sources around the clock, surfacing new industrial vendors the moment they appear.",
  },
  {
    n: "02",
    title: "Enrich",
    body: "AI agents read each vendor's web presence and registry records, extracting capabilities, equipment, certifications, and contacts into structured data.",
  },
  {
    n: "03",
    title: "Verify",
    body: "Claims are cross-checked against certification bodies and government records. Every field keeps its provenance trail.",
  },
  {
    n: "04",
    title: "Recommend",
    body: "Suitability scoring and ranked search put the right vendors at the top — described in plain English, ready to contact.",
  },
];

const LADDER = [
  {
    icon: Database,
    label: "Listed",
    body: "In the database with provenance attached.",
    ring: "border-line-strong text-fg-secondary",
    dot: "bg-fg-muted",
  },
  {
    icon: BadgeCheck,
    label: "Claimed",
    body: "The company owns and enriches its profile.",
    ring: "border-arc/40 text-arc",
    dot: "bg-arc/60",
  },
  {
    icon: ShieldCheck,
    label: "Verified",
    body: "Documents checked against issuing registries.",
    ring: "border-arc bg-arc/10 text-arc",
    dot: "bg-arc",
  },
  {
    icon: ClipboardCheck,
    label: "Level 1 Certified",
    body: "Passed an independent on-site inspection.",
    ring: "border-ok bg-ok/10 text-ok",
    dot: "bg-ok",
  },
];

export default async function Home() {
  const [stats, featured] = await Promise.all([getStats(), getFeaturedVendors(3)]);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="noise relative overflow-hidden">
        <Aurora />
        <div className="bg-grid bg-radial-fade absolute inset-0" aria-hidden="true" />
        {/* Canvas confined to the top of the hero so the glass console below it
            never sits over animating pixels (backdrop-filter + moving canvas =
            constant GPU re-blur — this keeps the page silky). */}
        <HeroCanvas className="absolute inset-x-0 top-0 h-[620px] w-full [mask-image:linear-gradient(180deg,black_65%,transparent)]" />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-24 text-center sm:px-6 sm:pt-32">
          <Badge tone="arc" className="anim-fade-up mb-6 !px-3.5 !py-1">
            <span className="status-dot !bg-arc" /> Agentic vendor intelligence · live database
          </Badge>
          <h1 className="anim-fade-up delay-1 font-display max-w-4xl text-4xl font-bold leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-7xl">
            Find the right vendor in <span className="text-gradient">seconds</span>, not weeks.
          </h1>
          <p className="anim-fade-up delay-2 mt-6 max-w-2xl text-base leading-relaxed text-fg-secondary sm:text-lg">
            AVLpoint&apos;s AI agents discover, enrich, and verify industrial suppliers across 14
            authoritative sources — so your approved vendor list builds itself.
          </p>
          <div className="anim-fade-up delay-3 mt-10 w-full max-w-2xl">
            <SearchBar />
            <p className="mt-3 font-mono text-xs text-fg-muted">
              Try &ldquo;AISC-certified structural steel fabricators in Texas&rdquo;
            </p>
          </div>

          {/* ---- Live product console ---- */}
          <div className="anim-fade-up delay-4 relative mt-16 w-full max-w-3xl">
            <div
              className="pointer-events-none absolute -inset-x-16 -top-10 bottom-0 opacity-70 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 45%, color-mix(in srgb, var(--arc) 14%, transparent), transparent 70%)",
              }}
              aria-hidden="true"
            />
            <Tilt max={3} bodyClassName="rounded-[20px]">
              <SearchConsole />
            </Tilt>
            {/* floating accents */}
            <div className="float-y absolute -left-36 top-10 hidden xl:block" aria-hidden="true">
              <span className="glass-panel !rounded-full px-3.5 py-1.5 font-mono text-[11px] text-fg-secondary">
                <span className="text-arc">◆</span> provenance on every field
              </span>
            </div>
            <div className="float-y-late absolute -right-32 bottom-16 hidden xl:block" aria-hidden="true">
              <span className="glass-panel !rounded-full px-3.5 py-1.5 font-mono text-[11px] text-ok">
                ✓ verified against registries
              </span>
            </div>
          </div>

          <div className="anim-fade-up delay-5 mb-20 mt-16 grid w-full max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
            <StatCounter value={stats.totalVendors} suffix="+" label="Vendors indexed" />
            <StatCounter value={stats.verifiedVendors} label="Verified profiles" />
            <StatCounter value={stats.sources} label="Data sources" />
            <StatCounter value={stats.countries} suffix="+" label="Countries covered" />
          </div>
        </div>
      </section>

      {/* ---------- Source marquee ---------- */}
      <section className="border-y border-line bg-surface py-6" aria-label="Data sources">
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="marquee-track gap-12 pr-12">
            {[...SOURCES, ...SOURCES].map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="flex items-center gap-2 whitespace-nowrap font-mono text-sm text-fg-muted"
              >
                <span className="h-1 w-1 rounded-full bg-arc/60" />
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6" id="features">
        <Reveal>
          <SectionHeading
            eyebrow="Platform"
            title="Procurement-grade intelligence, built automatically"
            subtitle="Every capability below runs against the live vendor database today — no demo data, no manual curation."
          />
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <Tilt className="h-full" bodyClassName="h-full rounded-2xl">
                <div className="card shine h-full p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc shadow-[0_0_24px_-8px_var(--glow)]">
                    <f.icon size={20} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-fg">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{f.body}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="noise relative overflow-hidden border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Pipeline"
              title="From open web to approved vendor list"
              subtitle="A continuously running agentic pipeline turns scattered public signals into procurement-ready vendor profiles. Watch the data move."
            />
          </Reveal>
          <Reveal variant="scale">
            <div className="card gradient-ring overflow-hidden p-2 sm:p-4">
              <PipelineDiagram className="h-auto w-full" />
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="group relative h-full rounded-2xl border border-line bg-bg p-6 transition-colors duration-300 hover:border-arc/40">
                  <p className="font-mono text-sm font-semibold text-arc">{s.n}</p>
                  <div className="beam my-4 transition-opacity duration-300 group-hover:opacity-100" />
                  <h3 className="font-display text-lg font-semibold text-fg">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Trust ladder ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Trust"
            title="Every vendor climbs a visible ladder"
            subtitle="Four rungs from raw listing to independently inspected — so trust reads at a glance, and green always means certified."
          />
        </Reveal>
        <div className="relative">
          <div
            className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-line via-arc/50 to-ok lg:block"
            aria-hidden="true"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LADDER.map((step, i) => (
              <Reveal key={step.label} delay={i * 110}>
                <div className="relative flex h-full flex-col items-start">
                  <div
                    className={`relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border bg-surface ${step.ring}`}
                  >
                    <step.icon size={26} />
                    <span
                      className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ${step.dot}`}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-4 font-mono text-[11px] tracking-[0.2em] text-fg-muted">
                    RUNG 0{i + 1}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-fg">{step.label}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Live vendor preview ---------- */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="Live data"
                title="Straight from the vendor database"
                subtitle="A sample of verified, AI-enriched profiles — exactly as your team will see them."
              />
              <ButtonLink href="/search" variant="secondary" className="mb-12 shrink-0">
                Browse all vendors <ArrowRight size={15} />
              </ButtonLink>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {featured.map((v, i) => (
              <Reveal key={v.id} delay={i * 90}>
                <Tilt className="h-full" bodyClassName="h-full rounded-2xl">
                  <VendorCard vendor={v} />
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="noise relative overflow-hidden border-t border-line">
        <Aurora />
        <div className="bg-grid bg-radial-fade absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 py-28 text-center sm:px-6">
          <Reveal variant="scale">
            <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-5xl">
              Your next approved vendor is <span className="text-gradient">already in here</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-fg-secondary">
              Start searching the live database free. Upgrade when your whole team wants in.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Magnetic>
                <ButtonLink href="/signup" size="lg" className="shine">
                  Start free <ArrowRight size={16} />
                </ButtonLink>
              </Magnetic>
              <ButtonLink href="/pricing" variant="secondary" size="lg">
                View pricing
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-fg-muted">
              No credit card required ·{" "}
              <Link href="/contact" className="text-arc hover:underline">
                Talk to us
              </Link>{" "}
              about enterprise rollouts
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
