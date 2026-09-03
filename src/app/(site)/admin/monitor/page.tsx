import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/platform";
import { can } from "@/lib/rbac";
import {
  getBudget,
  getFunnel,
  getGrowthStats,
  getDiscoveryProgress,
  getActivityTicker,
} from "@/lib/monitor";
import type { MonitorSnapshot } from "@/lib/monitor-types";
import { MonitorLive } from "@/components/admin/monitor/monitor-live";

export const metadata: Metadata = { title: "Pipeline Monitor — AVLpoint" };

/**
 * Read-only observability dashboard. Every data source here (readonly
 * SQLite handle, fs reads, a read-only PowerShell scheduled-task query) is
 * incapable of writing back to vendors.db or the pipeline scripts.
 *
 * Scheduled-task health is deliberately NOT fetched here: spawning
 * powershell.exe + Get-ScheduledTask takes several seconds cold (module
 * load, Windows process-creation overhead), which made this page block on
 * server render for 5-20+ seconds — MonitorLive fetches it client-side on
 * mount instead, so the page shell renders instantly and task health fills
 * in a moment later.
 */
export default async function PipelineMonitorPage() {
  const session = await getSession();
  if (!session || !isAdminSession(session)) redirect("/login?next=/admin/monitor");
  if (!can(session.role, "monitor.view")) redirect("/admin");

  const initial: MonitorSnapshot = {
    budget: getBudget(),
    funnel: getFunnel(),
    growth: getGrowthStats(),
    discovery: getDiscoveryProgress(),
    tasks: [],
    ticker: getActivityTicker(30),
    generatedAt: new Date().toISOString(),
  };

  return <MonitorLive initial={initial} />;
}
