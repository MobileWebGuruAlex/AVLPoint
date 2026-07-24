import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensurePlatformTables } from "@/lib/platform";
import { can } from "@/lib/rbac";
import { exportVendors, type AdminFilters } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !can(session.role, "vendors.export")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  ensurePlatformTables();

  const sp = request.nextUrl.searchParams;
  const filters: AdminFilters = {};

  const tier = sp.get("tier");
  if (tier && tier !== "any") filters.tier = Number(tier);
  const lifecycle = sp.get("lifecycle");
  if (lifecycle && lifecycle !== "any") filters.lifecycle = lifecycle;
  const completeness = sp.get("completeness");
  if (completeness && completeness !== "any") filters.completeness = completeness;
  const state = sp.get("state");
  if (state === "awake" || state === "sleeping") filters.sleepState = state;
  const format = (sp.get("format") === "json") ? "json" : "csv";

  const { data, filename, contentType } = exportVendors(filters, format);

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
