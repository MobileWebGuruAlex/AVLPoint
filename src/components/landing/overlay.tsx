"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { CHAPTERS } from "./copy";

/**
 * The pinned HTML layer of the film — every chapter's copy block, positioned
 * per `align` so text never covers the clip's subject. All reveal/exit motion
 * is choreographed by the master GSAP timeline in landing.tsx via the
 * data attributes ([data-r], [data-beat], [data-unlock], [data-step], [data-cta]).
 */

const WORKFLOW_STEPS = [
  {
    n: "01",
    label: "Upload",
    body: "Certificate scanned — every field extracted by AI.",
  },
  {
    n: "02",
    label: "Verify",
    body: "Cross-checked against the issuing registry.",
  },
  {
    n: "03",
    label: "Approve",
    body: "Timestamped sign-off, audit trail written.",
  },
];

export function Overlay() {
  return (
    <div className="lp-overlay">
      {CHAPTERS.map((c, i) => {
        const Heading = i === 0 ? "h1" : "h2";
        return (
          <section
            key={c.key}
            className={`lp-ch lp-align-${c.align}`}
            data-ch={i}
            aria-label={c.kicker}
          >
            <div className="lp-copy">
              {i === 0 && (
                <div className="lp-mark" data-r>
                  <LogoMark size={46} />
                </div>
              )}
              <p className="lp-kicker" data-r>
                {c.kicker}
              </p>
              <Heading className="lp-title" data-r>
                {c.title}
              </Heading>
              {c.lines.map((l) => (
                <p className="lp-line" data-r key={l.slice(0, 24)}>
                  {l}
                </p>
              ))}
              {c.detail && (
                <p className="lp-detail" data-r>
                  {c.detail}
                </p>
              )}
              {c.chips && i !== 7 && (
                <div className="lp-chips" data-r>
                  {c.chips.map((chip) => (
                    <span className="lp-chip" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {c.beat && (
                <p className="lp-beat" data-beat>
                  {c.beat}
                </p>
              )}
              {c.unlock && (
                <div className="lp-unlock" data-unlock>
                  <span className="lp-unlock-dot" aria-hidden="true" />
                  {c.unlock}
                </div>
              )}
              {i === 3 && (
                <div className="lp-steps">
                  {WORKFLOW_STEPS.map((s, j) => (
                    <div className="lp-step" data-step={j} key={s.n}>
                      <span className="lp-step-glow" aria-hidden="true" />
                      <span className="lp-step-n">{s.n}</span>
                      <span className="lp-step-label">{s.label}</span>
                      <span className="lp-step-body">{s.body}</span>
                    </div>
                  ))}
                </div>
              )}
              {i === 9 && (
                <div className="lp-cta" data-cta>
                  <motion.span whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <Link href="/home" className="lp-btn-solid lp-btn-lg">
                      Enter AVLpoint <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </motion.span>
                  <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Link href="/contact" className="lp-btn-ghost lp-btn-lg">
                      Talk to us
                    </Link>
                  </motion.span>
                </div>
              )}
            </div>
          </section>
        );
      })}
      {/* triangle labels for the architecture chapter */}
      <div className="lp-arch-labels" data-ch-extra="7" aria-hidden="true">
        <span className="lp-arch-label" data-arch="0">
          Vendors
        </span>
        <span className="lp-arch-label" data-arch="1">
          Enterprises
        </span>
        <span className="lp-arch-label" data-arch="2">
          Inspectors
        </span>
      </div>
      {/* the ch5 breakthrough flash */}
      <div className="lp-flash" data-flash aria-hidden="true" />
    </div>
  );
}
