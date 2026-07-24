"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { CHAPTER_LABELS } from "./copy";

/**
 * Persistent chrome over the film: brand bar (with the always-available exit
 * into the product), the right-hand chapter rail, the live chapter counter,
 * and the scroll cue. The master timeline / onUpdate handler in landing.tsx
 * drives fill, active dots, and counter text imperatively.
 */
export function Hud({ onJump }: { onJump: (chapter: number) => void }) {
  return (
    <>
      <header className="lp-topbar" data-topbar>
        <div className="lp-brand">
          <LogoMark size={26} />
          <span className="lp-brand-word">
            AVL<b>point</b>
          </span>
        </div>
        <div className="lp-topbar-actions">
          <Link href="/home" className="lp-btn-ghost lp-btn-sm">
            Skip film
          </Link>
          <motion.span whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Link href="/home" className="lp-btn-solid lp-btn-sm">
              Enter AVLpoint <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </motion.span>
        </div>
      </header>

      <nav className="lp-rail" data-rail aria-label="Film chapters">
        <span className="lp-rail-track" aria-hidden="true">
          <span className="lp-rail-fill" data-railfill />
        </span>
        {CHAPTER_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className="lp-rail-dot"
            data-dot={i}
            aria-label={`Chapter ${i + 1}: ${label}`}
            onClick={() => onJump(i)}
          >
            <span className="lp-rail-tip">{label}</span>
          </button>
        ))}
      </nav>

      <div className="lp-counter" data-counter aria-live="off">
        01 · {CHAPTER_LABELS[0]}
      </div>

      <div className="lp-cue" data-cue aria-hidden="true">
        <ChevronDown size={16} className="lp-cue-chev" />
        Scroll to begin
      </div>
    </>
  );
}
