"use client";

import type { LogLine } from "@/lib/monitor";

export function ActivityTicker({ lines }: { lines: LogLine[] }) {
  if (lines.length === 0) {
    return <p className="text-sm italic text-fg-muted">No recent activity.</p>;
  }
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
      {lines.map((l, i) => (
        <div
          key={`${l.source}-${i}-${l.text.slice(0, 24)}`}
          className="flex items-start gap-2 rounded px-2 py-1.5 text-fg-secondary"
          style={{ animation: "fade-in 400ms ease-out" }}
        >
          <span
            className="mt-0.5 shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wider"
            style={{
              color: l.source === "v3" ? "var(--arc)" : "var(--arc-deep)",
              border: `1px solid color-mix(in srgb, ${l.source === "v3" ? "var(--arc)" : "var(--arc-deep)"} 40%, transparent)`,
            }}
          >
            {l.source === "v3" ? "v3" : "agent4"}
          </span>
          <span className="shrink-0 text-fg-muted">{l.timestamp ? l.timestamp.replace("T", " ") : "—"}</span>
          <span className="min-w-0 flex-1 truncate">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
