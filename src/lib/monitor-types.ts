/**
 * Shared type-only definitions for the pipeline monitor, importable from
 * both server code (src/lib/monitor.ts) and client components — this file
 * must never import better-sqlite3, fs, or child_process, or every client
 * component that imports it would try to bundle those Node built-ins.
 */

export interface BudgetInfo {
  spentUsd: number;
  capUsd: number;
  pct: number;
}

export const FUNNEL_STAGES = ["queued", "scraped", "submitted", "done", "failed", "triaged_out"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type FunnelCounts = Record<FunnelStage, number>;

export interface GrowthStats {
  usVendors: number;
  aiReadyPct: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface DiscoveryProgress {
  position: number;
  total: number | null;
}

export interface TaskHealth {
  name: string;
  state: string;
  lastRunTime: string | null;
  nextRunTime: string | null;
  lastTaskResult: number | null;
}

export interface LogLine {
  source: "v3" | "agent4";
  timestamp: string | null;
  text: string;
}

export interface MonitorSnapshot {
  budget: BudgetInfo;
  funnel: FunnelCounts;
  growth: GrowthStats;
  discovery: DiscoveryProgress;
  tasks: TaskHealth[];
  ticker: LogLine[];
  generatedAt: string;
}
