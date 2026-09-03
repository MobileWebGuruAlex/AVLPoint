/**
 * Read-only pipeline observability for /admin/monitor.
 *
 * This module must never write to vendors.db or touch pipeline_v3/ or
 * pipeline_agent4/ — it only opens a readonly SQLite handle, reads log
 * files, and shells out to read-only PowerShell scheduled-task queries.
 *
 * Path note: vendors.db and the pipeline directories are untracked runtime
 * artifacts that live in the main checkout, not necessarily in whichever
 * working directory this Next.js process happens to run from (e.g. a git
 * worktree during development). AVLPOINT_ROOT anchors every pipeline path
 * to the real machine location instead of process.cwd().
 */
import Database from "better-sqlite3";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { countryVariants } from "@/lib/utils";
import {
  FUNNEL_STAGES,
  type FunnelStage,
  type FunnelCounts,
  type BudgetInfo,
  type GrowthStats,
  type DiscoveryProgress,
  type TaskHealth,
  type LogLine,
} from "@/lib/monitor-types";

export * from "@/lib/monitor-types";

const execFileAsync = promisify(execFile);

export const AVLPOINT_ROOT = process.env.AVLPOINT_ROOT || "C:\\Projects\\AVLpoint";

const VENDORS_DB_PATH = path.join(AVLPOINT_ROOT, "vendors.db");
const DAEMON_LOG_PATH = path.join(AVLPOINT_ROOT, "pipeline_v3", "daemon.log");
const AGENT4_LOG_PATH = path.join(AVLPOINT_ROOT, "pipeline_agent4", "agent4.log");
const DISCOVER_STATE_PATH = path.join(AVLPOINT_ROOT, "pipeline_agent4", ".discover_state.json");

const DAILY_BUDGET_USD = 6.0; // pipeline_v3/state.py DAILY_BUDGET_USD — shared cross-pipeline ceiling

let _monitorDb: Database.Database | null | undefined;

/** Lazily opened, strictly readonly connection — separate from the app's own db.ts. */
function getMonitorDb(): Database.Database | null {
  if (_monitorDb !== undefined) return _monitorDb;
  try {
    _monitorDb = new Database(VENDORS_DB_PATH, { readonly: true, fileMustExist: true });
    _monitorDb.pragma("busy_timeout = 5000");
  } catch {
    _monitorDb = null;
  }
  return _monitorDb;
}

export function getBudget(): BudgetInfo {
  const db = getMonitorDb();
  let spentUsd = 0;
  if (db) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const row = db
        .prepare("SELECT spent_usd FROM enrich_v3_budget WHERE day = ?")
        .get(today) as { spent_usd: number } | undefined;
      spentUsd = row?.spent_usd ?? 0;
    } catch {
      /* table not present yet */
    }
  }
  return { spentUsd, capUsd: DAILY_BUDGET_USD, pct: (spentUsd / DAILY_BUDGET_USD) * 100 };
}

export function getFunnel(): FunnelCounts {
  const counts = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as FunnelCounts;
  const db = getMonitorDb();
  if (!db) return counts;
  try {
    const rows = db
      .prepare("SELECT stage, COUNT(*) n FROM enrich_v3_state GROUP BY stage")
      .all() as { stage: string; n: number }[];
    for (const r of rows) {
      if ((FUNNEL_STAGES as readonly string[]).includes(r.stage)) {
        counts[r.stage as FunnelStage] = r.n;
      }
    }
  } catch {
    /* table not present yet */
  }
  return counts;
}

export function getGrowthStats(): GrowthStats {
  const empty: GrowthStats = { usVendors: 0, aiReadyPct: 0, gold: 0, silver: 0, bronze: 0 };
  const db = getMonitorDb();
  if (!db) return empty;
  try {
    const usVariants = countryVariants("United States");
    const placeholders = usVariants.map(() => "?").join(",");

    const totalRow = db
      .prepare(`SELECT COUNT(*) n FROM vendors WHERE country IN (${placeholders})`)
      .get(...usVariants) as { n: number };
    const usVendors = totalRow.n;

    const aiReadyRow = db
      .prepare(
        `SELECT COUNT(*) n FROM vendors WHERE country IN (${placeholders}) AND ai_summary IS NOT NULL AND ai_summary != ''`
      )
      .get(...usVariants) as { n: number };
    const aiReadyPct = usVendors > 0 ? Math.round((aiReadyRow.n / usVendors) * 1000) / 10 : 0;

    const tierRows = db
      .prepare(
        `SELECT size_tier, COUNT(*) n FROM vendors WHERE country IN (${placeholders}) AND size_tier IN ('gold','silver','bronze') GROUP BY size_tier`
      )
      .all(...usVariants) as { size_tier: string; n: number }[];
    const tiers: Record<string, number> = { gold: 0, silver: 0, bronze: 0 };
    for (const r of tierRows) tiers[r.size_tier] = r.n;

    return { usVendors, aiReadyPct, gold: tiers.gold, silver: tiers.silver, bronze: tiers.bronze };
  } catch {
    return empty;
  }
}

export function getDiscoveryProgress(): DiscoveryProgress {
  let position = 0;
  try {
    const raw = fs.readFileSync(DISCOVER_STATE_PATH, "utf8");
    position = JSON.parse(raw).pos ?? 0;
  } catch {
    /* file not present yet */
  }

  let total: number | null = null;
  try {
    const log = fs.readFileSync(AGENT4_LOG_PATH, "utf8");
    // Most recent "grid 165->235/2695" line wins — the total combo count is
    // logged by discover.py every cycle, so no separate helper script needed.
    const matches = [...log.matchAll(/grid\s+\d+->\d+\/(\d+)/g)];
    if (matches.length > 0) total = parseInt(matches[matches.length - 1][1], 10);
  } catch {
    /* file not present yet */
  }

  return { position, total };
}

const TASK_NAMES = [
  "AVLpoint Pipeline v3",
  "AVLpoint Agent4",
  "AVLpoint Watchdog",
  "AVLpoint Agent4 Watchdog",
  "AVLpoint Site Keepalive",
];

/** Read-only PowerShell query — never Set-ScheduledTask or anything mutating. */
export async function getTaskHealth(): Promise<TaskHealth[]> {
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $names = @(${TASK_NAMES.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")})
    $results = foreach ($n in $names) {
      $task = Get-ScheduledTask -TaskName $n 2>$null
      if ($task) {
        $info = $task | Get-ScheduledTaskInfo 2>$null
        [PSCustomObject]@{
          name = $n
          state = $task.State.ToString()
          lastRunTime = if ($info.LastRunTime) { $info.LastRunTime.ToString("o") } else { $null }
          nextRunTime = if ($info.NextRunTime) { $info.NextRunTime.ToString("o") } else { $null }
          lastTaskResult = $info.LastTaskResult
        }
      } else {
        [PSCustomObject]@{ name = $n; state = "NotFound"; lastRunTime = $null; nextRunTime = $null; lastTaskResult = $null }
      }
    }
    $results | ConvertTo-Json -Compress
  `;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 10_000, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout.trim() || "[]");
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((t) => ({
      name: t.name,
      state: t.state ?? "Unknown",
      lastRunTime: t.lastRunTime ?? null,
      nextRunTime: t.nextRunTime ?? null,
      lastTaskResult: t.lastTaskResult ?? null,
    }));
  } catch {
    return TASK_NAMES.map((name) => ({
      name,
      state: "Unknown",
      lastRunTime: null,
      nextRunTime: null,
      lastTaskResult: null,
    }));
  }
}

const MEANINGFUL_PATTERN = /\[(cycle|discover|daemon|website_finder_ai|psr_import|psr_resolve|registries|fix_names|size_backfill|dedupe_domain_duplicates)\]|====|^\s*(aug|JUNK)\s|^today's spend|^ingested:|^submitted batch/;

function tailFile(filePath: string, encoding: BufferEncoding, maxLines = 400): string[] {
  try {
    const buf = fs.readFileSync(filePath);
    const text = encoding === "utf16le" ? buf.toString("utf16le") : buf.toString("utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function parseLogLine(source: "v3" | "agent4", line: string): LogLine {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return { source, timestamp: m ? m[1] : null, text: line.trim() };
}

/**
 * daemon.log (v3) carries no per-line timestamps at all — only agent4.log
 * does — so the two sources can't be strictly interleaved by time. Each
 * source is reversed to newest-first internally (file append order is
 * chronological), then the two newest-first lists are round-robin merged.
 * v3 lines render without a timestamp rather than a fabricated one.
 */
export function getActivityTicker(limit = 30): LogLine[] {
  // daemon.log is UTF-16LE — decoding it as utf8 reads as garbage (null-byte
  // interleaved text), so this must be explicit.
  const v3Lines = tailFile(DAEMON_LOG_PATH, "utf16le")
    .map((l) => parseLogLine("v3", l))
    .filter((l) => MEANINGFUL_PATTERN.test(l.text))
    .reverse();
  const agent4Lines = tailFile(AGENT4_LOG_PATH, "utf8")
    .map((l) => parseLogLine("agent4", l))
    .filter((l) => MEANINGFUL_PATTERN.test(l.text))
    .reverse();

  const merged: LogLine[] = [];
  let i = 0;
  let j = 0;
  while (merged.length < limit && (i < v3Lines.length || j < agent4Lines.length)) {
    if (j < agent4Lines.length) merged.push(agent4Lines[j++]);
    if (merged.length < limit && i < v3Lines.length) merged.push(v3Lines[i++]);
  }
  return merged;
}
