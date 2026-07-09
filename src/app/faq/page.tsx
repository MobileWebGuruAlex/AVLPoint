import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { SectionHeading, ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Common questions about AVLpoint's data, verification, and plans.",
};

const FAQS = [
  {
    q: "Where does the vendor data come from?",
    a: "Fourteen authoritative sources: certification bodies (ASME, AISC), government registries (EPA ECHO, OpenCorporates), industry directories (ThomasNet, IQS Directory, IndustryNet, MacRAE's, CEMA, The Fabricator), open data (Wikidata, OpenStreetMap), plus targeted web discovery. Records are deduplicated and merged into a single profile per vendor, and every field keeps a provenance trail back to its source.",
  },
  {
    q: "What does “verified” mean on a profile?",
    a: "A profile is marked verified when its core identity fields are confirmed across independent sources and its completeness passes our quality gate. Certifications additionally link to the issuing registry where available. Verification status and a confidence grade are shown on every profile — we grade our own data honestly.",
  },
  {
    q: "How do the AI summaries work?",
    a: "AI agents read each vendor's public web presence and registry records, extract 90+ structured fields, and write a plain-English capability summary. Extraction runs under a zero-waste protocol: free parsing handles most fields, and language models are used only for what's still missing, under strict cost ceilings.",
  },
  {
    q: "What are enterprise tiers?",
    a: "Every vendor is automatically graded into three readiness tiers using facility scale, certifications, operating history, and customer evidence. Tier 1 vendors show the strongest signals for enterprise procurement; Tier 3 are earlier in enrichment or smaller-scale shops. Tiers re-compute as new data arrives.",
  },
  {
    q: "How current is the database?",
    a: "The discovery and enrichment pipeline runs continuously — new vendors are added and existing profiles refreshed around the clock. Each profile displays its last-updated date, so you always know how fresh the data is.",
  },
  {
    q: "I'm a vendor. How do I claim or correct my profile?",
    a: "Create a free account, open your company's profile, and hit “Claim this company.” We verify affiliation (company-domain email is fastest), then you can correct details, add capabilities, and progress up the Trust Ladder: Listed → Claimed → Verified → Level 1 Certified.",
  },
  {
    q: "What is the Trust Ladder?",
    a: "Every vendor sits on a visible four-rung ladder. Listed means the vendor is in our database with provenance. Claimed means the company owns its profile. Verified means documents were checked against issuing registries. Level 1 Certified means the vendor passed an independent on-site inspection, with a dated, expiring certificate. Green is reserved exclusively for certification — you can read trust at a glance.",
  },
  {
    q: "Which AI powers the recommendations, and is it trustworthy?",
    a: "Claude, running against our own database on our own infrastructure. Retrieval happens in our search index; the model only re-ranks and explains candidates it was given, citing database fields. It cannot invent vendors or capabilities — ungrounded output is rejected before it reaches you. Any paid placement is always visibly labeled.",
  },
  {
    q: "How do I get my information removed or corrected?",
    a: "Use the Do Not Sell / Removal page (no account required). We honor CCPA and GDPR requests — deletion, correction, and opt-out of sale or sharing — and confirm by email, within 30 days at the latest.",
  },
  {
    q: "Can I export vendors or access the data via API?",
    a: "Professional plans include CSV/AVL export of shortlists. Full API access to the database is part of Enterprise agreements — talk to sales for details.",
  },
  {
    q: "What industries are covered?",
    a: "The current focus is industrial manufacturing: metal fabricators, welders, machine shops, structural steel, pressure vessels, industrial machinery, and related suppliers across North America and Europe. Coverage expands continuously.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Reveal>
        <SectionHeading
          center
          eyebrow="FAQ"
          title="Questions, answered"
          subtitle="Everything teams usually ask before trusting a new data source."
        />
      </Reveal>
      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <Reveal key={f.q} delay={Math.min(i, 4) * 60}>
            <details className="card group p-0">
              <summary className="cursor-pointer list-none px-6 py-4.5 font-display text-[15px] font-semibold text-fg transition-colors hover:text-arc [&::-webkit-details-marker]:hidden">
                <span className="mr-3 font-mono text-xs text-arc">{String(i + 1).padStart(2, "0")}</span>
                {f.q}
              </summary>
              <div className="px-6 pb-5 pl-13 text-sm leading-relaxed text-fg-secondary">
                {f.a}
              </div>
            </details>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-12 text-center">
        <p className="text-sm text-fg-secondary">Still curious?</p>
        <ButtonLink href="/contact" variant="secondary" className="mt-4">
          Ask us directly
        </ButtonLink>
      </Reveal>
    </div>
  );
}
