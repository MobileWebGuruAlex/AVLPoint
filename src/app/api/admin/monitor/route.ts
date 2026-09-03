import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/platform";
import { can } from "@/lib/rbac";
import {
  getBudget,
  getFunnel,
  getGrowthStats,
  getDiscoveryProgress,
  getTaskHealth,
  getActivityTicker,
} from "@/lib/monitor";

export const dynamic = "force-dynamic";

/**
 * Read-only snapshot for the pipeline monitor dashboard. Every helper this
 * calls opens data read-only (SQLite readonly handle, fs reads, a read-only
 * PowerShell task query) — this route cannot mutate the pipelines or the DB.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !isAdminSession(session) || !can(session.role, "monitor.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tasks] = await Promise.all([getTaskHealth()]);

  return NextResponse.json({
    budget: getBudget(),
    funnel: getFunnel(),
    growth: getGrowthStats(),
    discovery: getDiscoveryProgress(),
    tasks,
    ticker: getActivityTicker(30),
    generatedAt: new Date().toISOString(),
  });
}
