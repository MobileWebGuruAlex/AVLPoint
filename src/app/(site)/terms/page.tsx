import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern use of the AVLpoint platform and database.",
};

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="card p-6 sm:p-7">
        <h2 className="mb-3 font-display text-lg font-semibold text-fg">
          <span className="mr-3 font-mono text-sm text-arc">{n}</span>
          {title}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-fg-secondary">{children}</div>
      </section>
    </Reveal>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="anim-fade-up mb-10 text-center">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-arc">Legal</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 font-mono text-xs text-fg-muted">Effective July 2026 · avlpoint.com</p>
      </div>

      <div className="space-y-5">
        <Section n="01" title="Acceptance">
          <p>
            By creating an account or using avlpoint.com (&ldquo;AVLpoint&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;), you agree to these Terms. If you use AVLpoint on behalf of an
            organization, you represent that you can bind that organization.
          </p>
        </Section>

        <Section n="02" title="The service and access tiers">
          <p>
            AVLpoint provides a database of industrial vendors compiled from public sources and
            first-party submissions, plus AI-assisted search, ranking, and explanation tools.
            Access is tiered: anonymous visitors see limited results; registered accounts see full
            company-level profiles; paid plans add exports, AI features, and team tools. We may
            adjust what each tier includes with notice.
          </p>
        </Section>

        <Section n="03" title="No scraping or bulk extraction">
          <p>
            You may not scrape, crawl, harvest, bulk-download, or systematically extract any part
            of the AVLpoint database, whether manually or by automated means, and you may not
            circumvent rate limits, access controls, or account gates. Permitted exports (e.g. CSV
            on paid plans) are for your organization&apos;s internal procurement use only and may
            not be resold, republished, or used to build a competing dataset. Exports are
            watermarked to the exporting account. Violation of this section is a material breach
            and grounds for immediate termination.
          </p>
        </Section>

        <Section n="04" title="Trust badges: what they mean (and don't)">
          <p>
            <strong className="text-fg">Listed</strong> means a vendor appears in our database with
            source provenance. <strong className="text-fg">Claimed</strong> means a representative
            of the company has taken ownership of the profile.{" "}
            <strong className="text-fg">Verified</strong> means stated documents and certifications
            were checked against issuing registries at a point in time.{" "}
            <strong className="text-fg">Level 1 Certified</strong> means the vendor passed an
            independent on-site inspection, with a dated certificate and expiry.
          </p>
          <p>
            All badges are point-in-time assessments. They are not a warranty, endorsement, or
            guarantee of any vendor&apos;s future performance, quality, solvency, or fitness for a
            particular purpose. Procurement decisions remain yours.
          </p>
        </Section>

        <Section n="05" title="Recommendation transparency">
          <p>
            AI recommendations are ranked by relevance and grounded in database records. Any paid
            placement or network membership that affects presentation is always visibly labeled.
            We do not accept compensation for unlabeled ranking boosts — from anyone.
          </p>
        </Section>

        <Section n="06" title="Accounts and acceptable use">
          <p>
            Keep your credentials secure; you are responsible for activity under your account. You
            may not use AVLpoint to violate law, infringe rights, transmit malware, misrepresent
            affiliation (including false profile claims), or interfere with the service.
          </p>
        </Section>

        <Section n="07" title="Intellectual property">
          <p>
            The AVLpoint platform, brand, badge designs, and the selection, arrangement, and
            enrichment of the database are our intellectual property. Vendor trademarks and logos
            belong to their owners and appear for identification only.
          </p>
        </Section>

        <Section n="08" title="Disclaimers and liability">
          <p>
            The service is provided &ldquo;as is&rdquo;. Data is compiled from public sources and
            third parties and, despite provenance tracking and verification, may contain errors —
            report them and we will correct promptly. To the maximum extent permitted by law, our
            aggregate liability is limited to the fees you paid in the twelve months before the
            claim.
          </p>
        </Section>

        <Section n="09" title="Termination and changes">
          <p>
            You may close your account anytime. We may suspend accounts that breach these Terms,
            especially Section 03. We may update these Terms; material changes will be announced
            and continued use constitutes acceptance.
          </p>
        </Section>

        <Section n="10" title="Contact">
          <p>
            Questions:{" "}
            <Link href="/contact" className="text-arc hover:underline">
              contact us
            </Link>{" "}
            or <span className="font-mono">legal@avlpoint.com</span>. Privacy matters are covered
            by our{" "}
            <Link href="/privacy" className="text-arc hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/do-not-sell" className="text-arc hover:underline">
              Do Not Sell / Removal
            </Link>{" "}
            page.
          </p>
        </Section>
      </div>
    </div>
  );
}
