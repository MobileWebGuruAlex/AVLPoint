// Shadow copy of src/app/page.tsx for type-checking (workspace mount workaround). Safe to delete.
import Link from "next/link";
import {
  Bot,
  FileSearch,
  Fingerprint,
  Gauge,
  Radar,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { HeroCanvas } from "@/components/hero-canvas";
import { SearchBar } from "@/components/search-bar";
import { StatCounter } from "@/components/stat-counter";
import { Reveal } from "@/components/reveal";
import { SectionHeading, ButtonLink, Badge } from "@/components/ui";
import { VendorCard } from "@/components/vendor-card";
import { getStats, getFeaturedVendors } from "@/lib/vendors";

const SOURCES = [
  "ThomasNet", "ASME", "AISC", "EPA ECHO", "OpenCorporates", "Wikidata",
  "OpenStreetMap", "IQS Directory", "MacRAE's", "IndustryNet", "CEMA",
  "The Fabricator", "Nimbleway", "Web Discovery",
];

const FEATURES = [
  { icon: Bot, title: "Agentic AI enrichment", body: "x" },
  { icon: Radar, title: "14-source discovery", body: "x" },
  { icon: ShieldCheck, title: "Verified certifications", body: "x" },
  { icon: Fingerprint, title: "Field-level provenance", body: "x" },
  { icon: Gauge, title: "Enterprise suitability scoring", body: "x" },
  { icon: FileSearch, title: "Full-text intelligence search", body: "x" },
];

const STEPS = [
  { n: "01", title: "Discover", body: "x" },
  { n: "02", title: "Enrich", body: "x" },
  { n: "03", title: "Verify", body: "x" },
  { n: "04", title: "Recommend", body: "x" },
];

export default async function Home() {
  const [stats, featured] = await Promise.all([getStats(), getFeaturedVendors(3)]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-grid bg-radial-fade absolute inset-0" aria-hidden="true" />
        <HeroCanvas className="absolute inset-0 h-full w-full" />
        <Badge tone="arc" className="anim-fade-up mb-6 !px-3.5 !py-1">
          <span className="status-dot !bg-arc" /> Agentic vendor intelligence
        </Badge>
        <div className="anim-fade-up delay-3 mt-10 w-full max-w-2xl">
          <SearchBar />
        </div>
        <div className="anim-fade-up delay-5 mt-16 grid w-full max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
          <StatCounter value={stats.totalVendors} suffix="+" label="Vendors indexed" />
          <StatCounter value={stats.verifiedVendors} label="Verified profiles" />
          <StatCounter value={stats.sources} label="Data sources" />
          <StatCounter value={stats.countries} suffix="+" label="Countries covered" />
        </div>
      </section>

      <section className="border-y border-line bg-surface py-6" aria-label="Data sources">
        <div className="marquee-track gap-12 pr-12">
          {[...SOURCES, ...SOURCES].map((s, i) => (
            <span key={`${s}-${i}`}>{s}</span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6" id="features">
        <Reveal>
          <SectionHeading eyebrow="Platform" title="t" subtitle="s" />
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="card card-hover h-full p-6">
                <f.icon size={20} />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section>
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 90}>
            <div>{s.title}</div>
          </Reveal>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <ButtonLink href="/search" variant="secondary" className="mb-12 shrink-0">
          Browse all vendors <ArrowRight size={15} />
        </ButtonLink>
        <div className="grid gap-5 md:grid-cols-3">
          {featured.map((v, i) => (
            <Reveal key={v.id} delay={i * 90}>
              <VendorCard vendor={v} />
            </Reveal>
          ))}
        </div>
        <Link href="/contact" className="text-arc hover:underline">
          Talk to us
        </Link>
      </section>
    </>
  );
}
