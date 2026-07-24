import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensurePlatformTables } from "@/lib/platform";
import { can } from "@/lib/rbac";
import { countVendorsByFilter, sampleVendorsByFilter, type AdminFilters } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !can(session.role, "vendors.view")) {
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
  const confidence = sp.get("confidence");
  if (confidence && confidence !== "any") filters.confidence = confidence;
  const country = sp.get("country");
  if (country && country !== "any") filters.country = country;
  const hasWebsite = sp.get("hasWebsite");
  if (hasWebsite === "yes") filters.hasWebsite = true;
  else if (hasWebsite === "no") filters.hasWebsite = false;
  const hasEmail = sp.get("hasEmail");
  if (hasEmail === "yes") filters.hasEmail = true;
  else if (hasEmail === "no") filters.hasEmail = false;
  const dataSource = sp.get("dataSource");
  if (dataSource) filters.dataSource = dataSource;
  const state = sp.get("state");
  if (state === "awake" || state === "sleeping") filters.sleepState = state;
  const q = sp.get("q");
  if (q) filters.q = q;

  const count = countVendorsByFilter(filters);
  const sample = sampleVendorsByFilter(filters, 10).map((v) => v.company_name);

  return NextResponse.json({ count, sample });
}
