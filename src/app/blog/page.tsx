import type { Metadata } from "next";
import { ArrowRight, PenLine } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { SectionHeading, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on vendor intelligence, industrial procurement, and agentic data pipelines.",
};

// Structure ready for a CMS or MDX — replace with real posts when publishing begins.
const POSTS = [
  {
    slug: "why-avls-go-stale",
    tag: "Procurement",
    date: "Coming soon",
    title: "Why every approved vendor list is stale the day it's approved",
    excerpt:
      "The average AVL is a snapshot of a moving target. Certifications lapse, shops close, capabilities change — and spreadsheets don't notice.",
  },
  {
    slug: "zero-waste-enrichment",
    tag: "Engineering",
    date: "Coming soon",
    title: "Zero-waste enrichment: extracting 90 fields without burning tokens",
    excerpt:
      "How we structure a pipeline where free parsing does 80% of the work and language models only touch what's genuinely missing.",
  },
  {
    slug: "verifying-certifications",
    tag: "Data",
    date: "Coming soon",
    title: "Trust, but verify: tracing certifications to the source registry",
    excerpt:
      "Self-reported certifications are marketing. Registry-confirmed certifications are data. The difference matters more than you'd think.",
  },
];

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <Reveal>
        <SectionHeading
          center
          eyebrow="Blog"
          title="Field notes"
          subtitle="Vendor intelligence, industrial procurement, and the engineering behind agentic data pipelines."
        />
      </Reveal>
      <div className="space-y-5">
        {POSTS.map((p, i) => (
          <Reveal key={p.slug} delay={i * 80}>
            <article className="card card-hover group cursor-default p-7">
              <div className="flex items-center gap-3">
                <Badge tone="arc">{p.tag}</Badge>
                <span className="font-mono text-xs text-fg-muted">{p.date}</span>
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-fg transition-colors group-hover:text-arc">
                {p.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-secondary">{p.excerpt}</p>
              <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-arc opacity-70">
                <PenLine size={13} /> In the writing queue <ArrowRight size={13} />
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
