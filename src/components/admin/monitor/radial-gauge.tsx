"use client";

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type GaugeTone = "ok" | "warn" | "danger" | "arc";

const TONE_VAR: Record<GaugeTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  arc: "var(--arc)",
};

export function toneForPct(pct: number): GaugeTone {
  if (pct >= 90) return "danger";
  if (pct >= 65) return "warn";
  return "ok";
}

/**
 * Circular progress dial. `pct` may exceed 100 (e.g. over-budget) — the ring
 * itself clamps visually at a full circle while the center label shows the
 * true value, so overage is legible rather than silently hidden.
 */
export function RadialGauge({
  pct,
  tone,
  label,
  sublabel,
}: {
  pct: number;
  tone: GaugeTone;
  label: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={TONE_VAR[tone]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1), stroke 500ms ease",
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${TONE_VAR[tone]} 45%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-bold text-fg tabular-nums">{label}</span>
        {sublabel && <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
