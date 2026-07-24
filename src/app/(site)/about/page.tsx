import type { Metadata } from "next";
import { ArrowRight, Compass, Crosshair, Scale } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Aurora } from "@/components/aurora";
import { Tilt } from "@/components/tilt";
import { SectionHeading, ButtonLink } from "@/components/ui";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "About",
  description: "Why AVLpoint exists: vendor discovery is broken, and AI agents can fix it.",
};

const VALUES = [
  {
    icon: Crosshair,
    title: "Precision over volume",
    body: "A shortlist of five right vendors beats a directory of five thousand maybes. Everything we build optimizes for the right answer, ranked first.",
  },
  {
    icon: Scale,
    title: "Evidence over claims",
    body: "Marketing copy is not data. We trace certifications to registries, keep provenance on every field, and grade our own confidence honestly.",
  },
  {
    icon: Compass,
    title: "Automation with judgment",
    body: "Our agents run continuously, but under hard cost ceilings, quarantine rules, and quality gates. Autonomy is engineered, not assumed.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      <Aurora />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="anim-fade-up mx-auto max-w-3xl text-center">
        <div className="mb-6 flex justify-center">
          <LogoMark size={56} />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          Vendor discovery is stuck in 2005.
          <br />
          <span className="text-gradient">We&apos;re un-sticking it.</span>
        </h1>
      </div>

      <Reveal className="mx-auto mt-14 max-w-2xl">
        <div className="space-y-5 text-[15px] leading-relaxed text-fg-secondary">
          <p>
            Ask any procurement engineer how they find a new fabricator and you&apos;ll hear the
            same story: stale directories, cold Google searches, PDF capability statements from
            2019, and a spreadsheet called{" "}
            <span className="font-mono text-sm text-fg">approved_vendors_FINAL_v7.xlsx</span>.
            Qualifying a single supplier takes weeks. Multiply that across every project and
            it&apos;s one of the largest hidden costs in industrial manufacturing.
          </p>
          <p>
            AVLpoint started with a simple observation: everything you need to qualify a vendor —
            their certifications, equipment, facility, history, customers — already exists in
            public sources. It&apos;s just scattered across registries, directories, and 85,000
            individual websites. That is precisely the kind of problem AI agents are built for.
          </p>
          <p>
            So we built an autonomous pipeline that reads those sources the way an expert buyer
            would: cross-checking claims against certification bodies, extracting real
            capabilities from shop pages, scoring enterprise readiness, and writing it all up in
            plain English. The result is a living approved-vendor list — one that grows and
            corrects itself around the clock.
          </p>
          <p>
            And discovery is only half the problem. The other half is trust. That&apos;s why every
            vendor on AVLpoint sits on a visible Trust Ladder — Listed, Claimed, Verified, and
            Level 1 Certified after an independent on-site inspection. The world&apos;s biggest
            operators and the best small shops finally find each other, with the evidence built
            in. Big meets small, at one point.
          </p>
          <p className="font-medium text-fg">
            The name says it: AVL — approved vendor list — plus the point where your search ends.
          </p>
        </div>
      </Reveal>

      <div className="mt-24">
        <Reveal>
          <SectionHeading center eyebrow="Principles" title="How we build" />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={i * 90}>
              <Tilt className="h-full" bodyClassName="h-full rounded-2xl">
                <div className="card shine h-full p-6 text-center">
                  <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                    <v.icon size={20} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-fg">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{v.body}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal className="mt-24 text-center">
        <h2 className="font-display text-2xl font-bold text-fg">See it for yourself</h2>
        <p className="mt-2 text-sm text-fg-secondary">The database is live. The search is free.</p>
        <ButtonLink href="/search" size="lg" className="mt-6 shine">
          Find vendors <ArrowRight size={16} />
        </ButtonLink>
      </Reveal>
      </div>
    </div>
  );
}
