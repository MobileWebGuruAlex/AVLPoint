"use client";

import { useEffect, useRef, useState } from "react";
import { Database, TrendingUp, Award, Medal, Coins } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { MonitorSnapshot } from "@/lib/monitor-types";
import { RadialGauge, toneForPct } from "./radial-gauge";
import { FunnelBar } from "./funnel-bar";
import { TaskHealthList } from "./task-health";
import { ActivityTicker } from "./activity-ticker";
import { useCountUp } from "./use-count-up";

const POLL_MS = 7000;

export function MonitorLive({ initial }: { initial: MonitorSnapshot }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initial);
  const [connected, setConnected] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/admin/monitor", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: MonitorSnapshot = await res.json();
        setSnapshot(data);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }
    poll(); // task health is deliberately omitted from the server render (slow PowerShell
    // shell-out) — fetch it immediately on mount instead of waiting for the first tick.
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const { budget, funnel, growth, discovery, tasks, ticker, generatedAt } = snapshot;

  const usVendors = useCountUp(growth.usVendors);
  const aiReadyPct = useCountUp(Math.round(growth.aiReadyPct * 10));
  const gold = useCountUp(growth.gold);
  const silver = useCountUp(growth.silver);
  const bronze = useCountUp(growth.bronze);

  const discoveryPct = discovery.total ? (discovery.position / discovery.total) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Header with live indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Operations</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg">Pipeline Monitor</h1>
          <p className="mt-1 text-sm text-fg-muted">Read-only live view of the enrichment &amp; discovery pipelines.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: connected ? "var(--ok)" : "var(--danger)",
              boxShadow: connected ? "0 0 6px var(--ok)" : "0 0 6px var(--danger)",
              animation: connected ? "pulse-dot 2s ease-in-out infinite" : "none",
            }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            {connected ? "Live" : "Reconnecting"} · {new Date(generatedAt).toLocaleTimeString("en-US")}
          </span>
        </div>
      </div>

      {/* Dials */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:justify-around">
          <RadialGauge
            pct={budget.pct}
            tone={toneForPct(budget.pct)}
            label={`$${budget.spentUsd.toFixed(2)}`}
            sublabel={`of $${budget.capUsd.toFixed(2)}`}
          />
          <div className="text-center sm:text-left">
            <h2 className="font-display text-sm font-semibold text-fg">Today&apos;s Shared Spend</h2>
            <p className="mt-1 max-w-[220px] text-xs text-fg-muted">
              Combined v3 + Agent4 spend against the shared $6.00/day cap.
            </p>
            <p className="mt-2 font-mono text-xs" style={{ color: `var(--${toneForPct(budget.pct)})` }}>
              {budget.pct.toFixed(0)}% of daily cap
            </p>
          </div>
        </section>

        <section className="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:justify-around">
          <RadialGauge
            pct={discoveryPct}
            tone="arc"
            label={formatNumber(discovery.position)}
            sublabel={discovery.total ? `of ${formatNumber(discovery.total)}` : "grid unknown"}
          />
          <div className="text-center sm:text-left">
            <h2 className="font-display text-sm font-semibold text-fg">Discovery Grid Progress</h2>
            <p className="mt-1 max-w-[220px] text-xs text-fg-muted">
              Position in the (cert, state) combo grid Agent 4 is sweeping.
            </p>
            <p className="mt-2 font-mono text-xs text-arc">{discoveryPct.toFixed(1)}% of grid covered</p>
          </div>
        </section>
      </div>

      {/* Growth stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="US Vendors" value={usVendors} icon={Database} />
        <StatTile label="AI-Ready" value={aiReadyPct / 10} suffix="%" decimals icon={TrendingUp} tone="arc" />
        <StatTile label="Gold" value={gold} icon={Award} tone="warn" />
        <StatTile label="Silver" value={silver} icon={Medal} />
        <StatTile label="Bronze" value={bronze} icon={Coins} />
      </div>

      {/* Funnel + task health */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-fg">Enrichment Funnel</h2>
          <FunnelBar counts={funnel} />
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-fg">Scheduled Task Health</h2>
          <TaskHealthList tasks={tasks} />
        </section>
      </div>

      {/* Activity ticker */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--arc)", boxShadow: "0 0 6px var(--arc)", animation: "pulse-dot 2s ease-in-out infinite" }}
          />
          <h2 className="font-display text-sm font-semibold text-fg">Activity</h2>
        </div>
        <ActivityTicker lines={ticker} />
      </section>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function StatTile({
  label, value, icon: Icon, tone = "neutral", suffix = "", decimals = false,
}: {
  label: string; value: number; icon: typeof Database; tone?: "ok" | "arc" | "warn" | "neutral"; suffix?: string; decimals?: boolean;
}) {
  const toneColors = { ok: "text-ok", arc: "text-arc", warn: "text-warn", neutral: "text-fg" };
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-fg-muted" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      </div>
      <span className={`font-mono text-2xl font-bold tabular-nums ${toneColors[tone]}`}>
        {decimals ? value.toFixed(1) : formatNumber(Math.round(value))}
        {suffix}
      </span>
    </div>
  );
}
