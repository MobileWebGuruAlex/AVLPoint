"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ShieldCheck, Loader2, Lock } from "lucide-react";

/**
 * "Explain top matches" panel on the search page.
 * Calls /api/recommend (Claude-ranked, grounded reasoning).
 * Anonymous users get a signup prompt (tier T1 feature);
 * unconfigured deployments degrade gracefully.
 */

interface AiResult {
  id: number;
  company_name: string;
  location: string;
  certifications: string[];
  match_score: number;
  reasons: string[];
  trust_level: string;
}

export function AiRecommend({ query }: { query: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "locked" | "error">("idle");
  const [results, setResults] = useState<AiResult[]>([]);
  const [message, setMessage] = useState("");

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setState("locked");
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "AI ranking is unavailable right now.");
        setState("error");
        return;
      }
      setResults(data.results ?? []);
      setState("done");
    } catch {
      setMessage("AI ranking is unavailable right now.");
      setState("error");
    }
  }

  if (!query || query.length < 3) return null;

  return (
    <div className="glass-panel gradient-ring mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-arc/25 bg-arc/10 text-arc">
            <Sparkles size={15} />
          </span>
          <div>
            <p className="text-sm font-medium text-fg">AI-ranked matches, explained</p>
            <p className="font-mono text-[11px] text-fg-muted">
              grounded in database records only · never invented
            </p>
          </div>
        </div>
        {state === "idle" && (
          <button
            onClick={run}
            className="h-9 cursor-pointer rounded-[10px] bg-gradient-to-r from-arc to-arc-deep px-4 text-sm font-semibold text-arc-ink transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Explain top matches
          </button>
        )}
        {state === "loading" && (
          <span className="flex items-center gap-2 font-mono text-xs text-fg-secondary">
            <Loader2 size={14} className="animate-spin text-arc" /> ranking &amp; explaining…
          </span>
        )}
      </div>

      {state === "locked" && (
        <div className="border-t border-line px-5 py-4">
          <p className="flex items-center gap-2 text-sm text-fg-secondary">
            <Lock size={14} className="text-arc" />
            AI explanations are free with an account —{" "}
            <Link href="/signup" className="font-medium text-arc hover:underline">
              create one in 20 seconds
            </Link>
            .
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="border-t border-line px-5 py-4">
          <p className="text-sm text-fg-secondary">{message}</p>
        </div>
      )}

      {state === "done" && (
        <div className="space-y-2.5 border-t border-line p-5">
          {results.length === 0 && (
            <p className="text-sm text-fg-secondary">No confident matches for this query.</p>
          )}
          {results.map((r, i) => (
            <Link
              key={r.id}
              href={`/vendors/${r.id}`}
              className="result-enter block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-arc/40"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 truncate font-display text-sm font-semibold text-fg">
                  {r.company_name}
                  {r.trust_level === "verified" && <ShieldCheck size={13} className="shrink-0 text-arc" />}
                </p>
                <span className="shrink-0 font-mono text-sm font-semibold text-arc">
                  {r.match_score}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">{r.location}</p>
              <ul className="mt-2 space-y-1">
                {r.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-xs leading-relaxed text-fg-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-arc" aria-hidden="true" />
                    {reason}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
          <p className="pt-1 font-mono text-[10px] text-fg-muted">
            Ranked by Claude on AVLpoint infrastructure · reasons cite database fields only
          </p>
        </div>
      )}
    </div>
  );
}
