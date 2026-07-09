/**
 * Animated pipeline diagram: sources → AVLpoint hub → ranked AVL.
 * Pure SVG + CSS animations (see .wire / .node-pulse / .ring-spin in
 * globals.css) — no JS per frame, disabled by prefers-reduced-motion.
 */

const SOURCES = [
  { label: "ASME", y: 40 },
  { label: "AISC", y: 100 },
  { label: "EPA ECHO", y: 160 },
  { label: "ThomasNet", y: 220 },
  { label: "OpenCorporates", y: 280 },
  { label: "+9 more", y: 340 },
];

const RESULTS = [
  { y: 90, w: 88, score: "98" },
  { y: 180, w: 74, score: "93" },
  { y: 270, w: 62, score: "89" },
];

const HUB = { x: 460, y: 190 };

export function PipelineDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 920 380"
      className={className}
      role="img"
      aria-label="Diagram: fourteen data sources flow into the AVLpoint enrichment hub, which produces a ranked approved vendor list"
    >
      <defs>
        <linearGradient id="pd-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--arc)" />
          <stop offset="100%" stopColor="var(--arc-deep)" />
        </linearGradient>
        <radialGradient id="pd-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--arc)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--arc)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ---- wires: sources → hub ---- */}
      {SOURCES.map((s, i) => (
        <path
          key={s.label}
          d={`M 158 ${s.y} C 280 ${s.y}, 320 ${HUB.y}, ${HUB.x - 78} ${HUB.y}`}
          fill="none"
          stroke="var(--arc)"
          strokeOpacity="0.35"
          strokeWidth="1.5"
          className="wire"
          style={{ animationDelay: `${i * 0.22}s` }}
        />
      ))}

      {/* ---- wires: hub → results ---- */}
      {RESULTS.map((r, i) => (
        <path
          key={r.y}
          d={`M ${HUB.x + 78} ${HUB.y} C 620 ${HUB.y}, 640 ${r.y}, 706 ${r.y}`}
          fill="none"
          stroke="var(--arc-deep)"
          strokeOpacity="0.4"
          strokeWidth="1.5"
          className="wire wire-slow"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}

      {/* ---- source nodes ---- */}
      {SOURCES.map((s, i) => (
        <g key={s.label}>
          <circle
            cx="150"
            cy={s.y}
            r="5"
            fill="var(--surface-2)"
            stroke="var(--arc)"
            strokeOpacity="0.8"
            strokeWidth="1.5"
            className="node-pulse"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
          <text
            x="134"
            y={s.y + 4}
            textAnchor="end"
            fill="var(--fg-muted)"
            fontSize="12"
            fontFamily="var(--font-mono)"
          >
            {s.label}
          </text>
        </g>
      ))}
      <text x="60" y="14" fill="var(--fg-secondary)" fontSize="11" letterSpacing="2" fontFamily="var(--font-mono)">
        14 SOURCES
      </text>

      {/* ---- hub ---- */}
      <circle cx={HUB.x} cy={HUB.y} r="120" fill="url(#pd-glow)" />
      <circle
        cx={HUB.x}
        cy={HUB.y}
        r="66"
        fill="none"
        stroke="var(--arc)"
        strokeOpacity="0.35"
        strokeWidth="1"
        strokeDasharray="4 8"
        className="ring-spin"
      />
      {/* hexagon */}
      <path
        d={`M ${HUB.x} ${HUB.y - 52} l 45 26 v 52 l -45 26 l -45 -26 v -52 Z`}
        fill="var(--surface)"
        stroke="url(#pd-arc)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* inner spokes + point */}
      <g stroke="var(--arc)" strokeOpacity="0.7" strokeWidth="1.5">
        <line x1={HUB.x} y1={HUB.y} x2={HUB.x} y2={HUB.y - 30} />
        <line x1={HUB.x} y1={HUB.y} x2={HUB.x + 26} y2={HUB.y + 16} />
        <line x1={HUB.x} y1={HUB.y} x2={HUB.x - 26} y2={HUB.y + 16} />
      </g>
      <circle cx={HUB.x} cy={HUB.y - 30} r="4" fill="var(--surface)" stroke="var(--arc)" strokeWidth="2" />
      <circle cx={HUB.x + 26} cy={HUB.y + 16} r="4" fill="var(--surface)" stroke="var(--arc)" strokeWidth="2" />
      <circle cx={HUB.x - 26} cy={HUB.y + 16} r="4" fill="var(--surface)" stroke="var(--arc)" strokeWidth="2" />
      <circle cx={HUB.x} cy={HUB.y} r="8" fill="url(#pd-arc)" className="node-pulse" />
      <text
        x={HUB.x}
        y={HUB.y + 92}
        textAnchor="middle"
        fill="var(--fg-secondary)"
        fontSize="11"
        letterSpacing="2"
        fontFamily="var(--font-mono)"
      >
        DISCOVER · ENRICH · VERIFY
      </text>

      {/* ---- ranked results ---- */}
      {RESULTS.map((r, i) => (
        <g key={r.y}>
          <rect
            x="706"
            y={r.y - 26}
            width="164"
            height="52"
            rx="12"
            fill="var(--surface)"
            stroke="var(--line-strong)"
          />
          <rect x="722" y={r.y - 12} width="24" height="24" rx="6" fill="var(--surface-3)" />
          <rect x="756" y={r.y - 10} width={r.w} height="6" rx="3" fill="var(--fg-muted)" opacity="0.5" />
          <rect x="756" y={r.y + 4} width={r.w * 0.6} height="5" rx="2.5" fill="var(--fg-muted)" opacity="0.25" />
          <text
            x="856"
            y={r.y + 4}
            textAnchor="end"
            fill="var(--arc)"
            fontSize="13"
            fontWeight="600"
            fontFamily="var(--font-mono)"
          >
            {r.score}
          </text>
          <circle
            cx="706"
            cy={r.y}
            r="4"
            fill="var(--arc-deep)"
            className="node-pulse"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        </g>
      ))}
      <text x="706" y="14" fill="var(--fg-secondary)" fontSize="11" letterSpacing="2" fontFamily="var(--font-mono)">
        YOUR RANKED AVL
      </text>
    </svg>
  );
}
