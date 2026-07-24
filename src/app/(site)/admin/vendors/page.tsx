import type { Metadata } from "next";
import { adminSearchVendors, type AdminFilters } from "@/lib/admin";
import { VendorTable } from "@/components/admin/vendor-table";

export const metadata: Metadata = { title: "Vendors — Admin" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminVendorsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const filters: AdminFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    tier: sp.tier && sp.tier !== "any" ? Number(sp.tier) : undefined,
    lifecycle: typeof sp.lifecycle === "string" && sp.lifecycle !== "any" ? sp.lifecycle : undefined,
    completeness: typeof sp.completeness === "string" && sp.completeness !== "any" ? sp.completeness : undefined,
    confidence: typeof sp.confidence === "string" && sp.confidence !== "any" ? sp.confidence : undefined,
    country: typeof sp.country === "string" && sp.country !== "any" ? sp.country : undefined,
    businessType: typeof sp.businessType === "string" && sp.businessType !== "any" ? sp.businessType : undefined,
    dataSource: typeof sp.dataSource === "string" && sp.dataSource !== "any" ? sp.dataSource : undefined,
    hasWebsite: sp.hasWebsite === "yes" ? true : sp.hasWebsite === "no" ? false : undefined,
    hasEmail: sp.hasEmail === "yes" ? true : sp.hasEmail === "no" ? false : undefined,
    sleepState: sp.state === "awake" || sp.state === "sleeping" ? sp.state : undefined,
    page: sp.page ? Number(sp.page) : 1,
    sort: (sp.sort as AdminFilters["sort"]) ?? "updated",
    sortDir: sp.sortDir === "asc" ? "asc" : "desc",
  };

  const result = adminSearchVendors(filters);

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Vendor Management</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">
          All Vendors
        </h1>
      </div>

      <VendorTable
        vendors={result.vendors}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        currentFilters={filters}
      />
    </div>
  );
}
