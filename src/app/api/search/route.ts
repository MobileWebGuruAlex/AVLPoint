/**
 * JSON search API — powers typeahead today and previews the public
 * Enterprise API shape. GET /api/search?q=…&country=…&tier=…&page=…
 */
import { NextRequest, NextResponse } from "next/server";
import { searchVendors, type SearchFilters } from "@/lib/vendors";
import { jsonList, vendorLocation } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters: SearchFilters = {
    q: sp.get("q") ?? undefined,
    country: sp.get("country") ?? undefined,
    type: sp.get("type") ?? undefined,
    cert: sp.get("cert") ?? undefined,
    tier: sp.get("tier") ? Number(sp.get("tier")) : undefined,
    verified: sp.get("verified") === "1",
    sort: (sp.get("sort") as SearchFilters["sort"]) ?? "relevance",
    page: sp.get("page") ? Math.max(1, Number(sp.get("page"))) : 1,
  };

  const result = await searchVendors(filters);

  return NextResponse.json({
    meta: {
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      took_ms: result.tookMs,
      ranked: result.usedFts,
    },
    vendors: result.vendors.map((v) => ({
      id: v.id,
      company_name: v.company_name,
      website_url: v.website_url,
      location: vendorLocation(v),
      primary_business_type: v.primary_business_type,
      summary: v.ai_summary ?? v.company_description,
      certifications: jsonList(v.certifications_held),
      capabilities: jsonList(v.capabilities),
      enterprise_tier: v.enterprise_tier,
      verified: v.completeness_status === "verified",
      last_updated: v.last_updated,
    })),
  });
}
