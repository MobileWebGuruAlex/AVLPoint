"use client";

import type { TaskHealth } from "@/lib/monitor";

function toneFor(state: string): { color: string; label: string } {
  switch (state) {
    case "Ready":
      return { color: "var(--ok)", label: "Ready" };
    case "Running":
      return { color: "var(--arc)", label: "Running" };
    case "Disabled":
      return { color: "var(--danger)", label: "Disabled" };
    case "NotFound":
      return { color: "var(--danger)", label: "Not found" };
    default:
      return { color: "var(--fg-muted)", label: state || "Unknown" };
  }
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TaskHealthList({ tasks }: { tasks: TaskHealth[] }) {
  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const tone = toneFor(t.state);
        return (
          <div key={t.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: tone.color, boxShadow: `0 0 6px ${tone.color}` }}
              />
              <span className="text-sm text-fg-secondary">{t.name}</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px] text-fg-muted">
              <span style={{ color: tone.color }}>{tone.label}</span>
              <span>last {fmt(t.lastRunTime)}</span>
              <span>next {fmt(t.nextRunTime)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
