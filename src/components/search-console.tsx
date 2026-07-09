"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sparkles, MapPin, ShieldCheck, Cpu } from "lucide-react";

/**
 * The hero "AI search console" — a living product demo.
 * Types a real query, streams agent status, then ranks results
 * with animated match scores. Cycles through three scenarios.
 * Renders the finished state statically under prefers-reduced-motion.
 */

interface DemoResult {
  name: string;
  location: string;
  score: number;
  chips: string[];
  reason?: string;
}

interface Scenario {
  query: string;
  results: DemoResult[];
}

const SCENARIOS: Scenario[] = [
  {
    query: "ASME U-stamp pressure vessel shop near Houston, 10,000 gal",
    results: [
      {
        name: "Gulf Coast Vessel Works",
        location: "Houston, TX",
        score: 98,
        chips: ["ASME U", "R-Stamp"],
        reason: "U-stamp on file · 12,000 gal max capacity · 38 mi from Houston",
      },
      { name: "Bayou Fabrication Co.", location: "Baton Rouge, LA", score: 94, chips: ["ASME U", "NBIC"] },
      { name: "Lone Star Process Equipment", location: "Beaumont, TX", score: 91, chips: ["ASME U"] },
    ],
  },
  {
    query: "AS9100 five-axis titanium machining for aerospace",
    results: [
      {
        name: "Precision Aero Machining",
        location: "Wichita, KS",
        score: 97,
        chips: ["AS9100D", "5-axis"],
        reason: "AS9100D verified · Ti-6Al-4V listed in equipment records",
      },
      { name: "Cascade Titanium Works", location: "Everett, WA", score: 93, chips: ["AS9100", "NADCAP"] },
      { name: "Redstone CNC", location: "Huntsville, AL", score: 90, chips: ["AS9100"] },
    ],
  },
  {
    query: "AISC-certified structural steel for AWS D1.5 bridge work",
    results: [
      {
        name: "Ironline Structural",
        location: "Tulsa, OK",
        score: 96,
        chips: ["AISC", "AWS D1.5"],
        reason: "AISC cert traced to registry · D1.5 welders on staff",
      },
      { name: "Great Lakes Steel Fab", location: "Gary, IN", score: 92, chips: ["AISC", "AWS D1.1"] },
      { name: "Summit Bridgeworks", location: "Denver, CO", score: 89, chips: ["AISC"] },
    ],
  },
];

const STATUSES = ["parsing intent", "searching 85,000+ vendors", "ranking by suitability"];

type Phase = "typing" | "thinking" | "results" | "hold";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function SearchConsole() {
  const [scenario, setScenario] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [statusIdx, setStatusIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // SSR-safe reduced-motion detection without setState-in-effect.
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );

  useEffect(() => {
    if (reduced) return;
    const t = timers.current;
    const later = (fn: () => void, ms: number) => t.push(setTimeout(fn, ms));
    const s = SCENARIOS[scenario];

    if (phase === "typing") {
      if (typed.length < s.query.length) {
        later(() => setTyped(s.query.slice(0, typed.length + 1)), 26 + Math.random() * 30);
      } else {
        later(() => {
          setStatusIdx(0);
          setPhase("thinking");
        }, 350);
      }
    } else if (phase === "thinking") {
      if (statusIdx < STATUSES.length - 1) {
        later(() => setStatusIdx(statusIdx + 1), 520);
      } else {
        later(() => {
          setShown(0);
          setPhase("results");
        }, 520);
      }
    } else if (phase === "results") {
      if (shown < s.results.length) {
        later(() => setShown(shown + 1), 330);
      } else {
        later(() => setPhase("hold"), 300);
      }
    } else {
      // hold, then next scenario
      later(() => {
        setTyped("");
        setShown(0);
        setStatusIdx(0);
        setScenario((scenario + 1) % SCENARIOS.length);
        setPhase("typing");
      }, 4200);
    }
    return () => {
      t.forEach(clearTimeout);
      t.length = 0;
    };
  }, [phase, typed, statusIdx, shown, scenario, reduced]);

  const s = SCENARIOS[scenario];
  const displayTyped = reduced ? s.query : typed;
  const showStatus = !reduced && phase === "thinking";
  const showResults = reduced || phase === "results" || phase === "hold";
  const visibleCount = reduced ? s.results.length : shown;

  return (
    <div className="glass-panel gradient-ring relative overflow-hidden text-left">
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-ok/60" />
        </div>
        <p className="font-mono text-[11px] tracking-widest text-fg-muted">AVLPOINT · AI VENDOR SEARCH</p>
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-fg-muted">
          <span className="status-dot" /> LIVE
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {/* query line */}
        <div className="flex min-h-11 items-center gap-3 rounded-xl border border-line-strong bg-surface-2 px-4 py-2.5">
          <Sparkles size={16} className="shrink-0 text-arc" />
          <p className="min-w-0 truncate text-sm text-fg">
            {displayTyped}
            {!reduced && phase === "typing" && <span className="type-caret" />}
          </p>
        </div>

        {/* agent status */}
        <div className="mt-3 flex min-h-5 items-center gap-2 font-mono text-xs text-fg-muted">
          {showStatus && (
            <>
              <Cpu size={12} className="animate-pulse text-arc" />
              <span key={statusIdx} className="result-enter">
                {STATUSES[statusIdx]}…
              </span>
            </>
          )}
          {showResults && (
            <span className="result-enter">
              {s.results.length} matches ranked · <span className="text-arc">explained</span> · 0.4s
            </span>
          )}
        </div>

        {/* results */}
        <div className="mt-3 space-y-2.5" aria-live="polite">
          {showResults &&
            s.results.slice(0, visibleCount).map((r, i) => (
              <div
                key={r.name}
                className="result-enter rounded-xl border border-line bg-surface px-4 py-3"
                style={{ animationDelay: reduced ? undefined : `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <p className="truncate font-display text-sm font-semibold text-fg">{r.name}</p>
                    {i === 0 && <ShieldCheck size={14} className="shrink-0 text-ok" />}
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold text-arc">{r.score}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1 truncate text-xs text-fg-secondary">
                    <MapPin size={11} className="shrink-0 text-fg-muted" />
                    {r.location}
                    {r.chips.map((c) => (
                      <span key={c} className="ml-1.5 hidden rounded-full border border-arc/25 bg-arc/10 px-1.5 py-px font-mono text-[10px] text-arc sm:inline">
                        {c}
                      </span>
                    ))}
                  </p>
                  <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:w-32">
                    <div
                      className="score-bar h-full rounded-full bg-gradient-to-r from-arc to-arc-deep"
                      style={{ width: `${r.score}%`, animationDelay: `${i * 60 + 150}ms` }}
                    />
                  </div>
                </div>
                {i === 0 && r.reason && (
                  <p className="mt-2 border-t border-line pt-2 font-mono text-[11px] leading-relaxed text-fg-muted">
                    <span className="text-arc">why:</span> {r.reason}
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
