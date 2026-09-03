"use client";

import { formatNumber } from "@/lib/utils";
import type { FunnelCounts } from "@/lib/monitor";

const SEGMENTS: { key: keyof FunnelCounts; label: string; color: string }[] = [
  { key: "queued", label: "Queued", color: "var(--fg-muted)" },
  { key: "scraped", label: "Scraped", color: "var(--arc-deep)" },
  { key: "submitted", label: "Submitted", color: "var(--arc)" },
  { key: "done", label: "Done", color: "var(--ok)" },
  { key: "failed", label: "Failed", color: "var(--danger)" },
  { key: "triaged_out", label: "Triaged out", color: "var(--warn)" },
];

export function FunnelBar({ counts }: { counts: FunnelCounts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2">
        {SEGMENTS.map((s) => {
          const n = counts[s.key];
          const pct = total > 0 ? (n / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={s.key}
              style={{
                width: `${pct}%`,
                background: s.color,
                transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              title={`${s.label}: ${formatNumber(n)}`}
            />
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="text-fg-secondary">{s.label}</span>
            <span className="ml-auto font-mono text-fg-muted tabular-nums">{formatNumber(counts[s.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
