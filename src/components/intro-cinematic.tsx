"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cinematic entrance — a ~6-second brand film: the hexagon mark draws
 * itself in light, trailer lines rise and dissolve, a horizon sweep
 * reveals the final lockup, then the overlay lifts away into the hero.
 *
 * Hydration-safe architecture: the SERVER decides whether this renders at
 * all (page.tsx checks the `avl-intro` session cookie), so server and
 * client HTML always match — no inline-script DOM mutation, no mismatch.
 * On completion/skip we set that cookie; it expires when the browser
 * closes, so the film plays once per session.
 *
 *  - Pure CSS keyframes (GPU-composited), no dependencies.
 *  - Skippable instantly (button or Escape).
 *  - JS timers guarantee cleanup even if the stylesheet arrives late.
 *  - prefers-reduced-motion users: hidden by CSS immediately and
 *    dismissed on mount — they never experience it.
 */

const LINES = [
  { text: "85,000 vendors, discovered.", delay: "1.55s" },
  { text: "Verified against 14 sources.", delay: "2.45s" },
  { text: "Ranked by AI. Explained.", delay: "3.35s" },
];

function markSeen() {
  try {
    // Session cookie (no max-age) — mirrors sessionStorage semantics but
    // is readable by the server component that gates rendering.
    document.cookie = "avl-intro=1; path=/; samesite=lax";
  } catch {}
}

export function IntroCinematic() {
  const [gone, setGone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    // Reduced-motion: CSS already hides the overlay; dismiss + remember.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markSeen();
      setGone(true);
      return;
    }
    // Hard guarantee the intro ends on schedule even if an animation event
    // is swallowed (slow stylesheet, dev HMR).
    const t = setTimeout(() => {
      markSeen();
      setGone(true);
    }, skipped ? 450 : 6300);
    return () => clearTimeout(t);
  }, [skipped]);

  if (gone) return null;

  function finish() {
    markSeen();
    setGone(true);
  }

  return (
    <div
      className={cn("intro-overlay noise", skipped && "intro-skip")}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "intro-exit") finish();
      }}
      onKeyDown={(e) => e.key === "Escape" && setSkipped(true)}
      role="dialog"
      aria-label="AVLpoint introduction — press escape or the skip button to continue to the site"
    >
      {/* ambient depth */}
      <div className="bg-grid bg-radial-fade absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="intro-sweep" aria-hidden="true" />

      {/* the mark, drawing itself */}
      <svg viewBox="0 0 120 120" className="h-24 w-24 sm:h-32 sm:w-32" aria-hidden="true">
        <defs>
          <linearGradient id="intro-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--arc)" />
            <stop offset="100%" stopColor="var(--arc-deep)" />
          </linearGradient>
          <radialGradient id="intro-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--arc)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--arc)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#intro-halo)" className="intro-glow" />
        <path
          d="M60 8 L105 34 V86 L60 112 L15 86 V34 Z"
          fill="none"
          stroke="url(#intro-arc)"
          strokeWidth="4"
          strokeLinejoin="round"
          className="intro-hex"
        />
        <circle cx="60" cy="60" r="9" fill="url(#intro-arc)" className="intro-core" />
      </svg>

      {/* trailer lines */}
      <div className="relative mt-10 flex h-10 w-full items-center justify-center px-6 text-center">
        {LINES.map((l) => (
          <p
            key={l.text}
            className="intro-line font-display text-xl font-semibold tracking-tight text-fg sm:text-3xl"
            style={{ animationDelay: l.delay }}
          >
            {l.text}
          </p>
        ))}
        <p className="intro-final absolute font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
          AVL<span className="text-gradient">point</span>
          <span className="mt-2 block font-mono text-[10px] font-normal uppercase tracking-[0.3em] text-fg-muted sm:text-xs">
            Every vendor · Verified · One point
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setSkipped(true)}
        className="intro-skip-btn cursor-pointer rounded-full border border-line-strong bg-surface/70 px-4 py-2 font-mono text-xs text-fg-secondary backdrop-blur transition-colors hover:border-arc/50 hover:text-fg"
      >
        Skip intro →
      </button>
    </div>
  );
}
