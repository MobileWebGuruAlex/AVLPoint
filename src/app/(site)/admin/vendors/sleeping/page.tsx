import type { Metadata } from "next";
import { Moon } from "lucide-react";
import { adminSearchVendors, type AdminFilters } from "@/lib/admin";
import { VendorTable } from "@/components/admin/vendor-table";

export const metadata: Metadata = { title: "Sleeping Vendors — Admin" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The sleep overlay's home. Everything here is hidden from users and from
 * the main vendor list, but nothing is deleted — waking a vendor restores
 * it everywhere instantly.
 */
export default async function SleepingVendorsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const filters: AdminFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    sleepState: "sleeping",
    page: sp.page ? Number(sp.page) : 1,
    sort: (sp.sort as AdminFilters["sort"]) ?? "updated",
    sortDir: sp.sortDir === "asc" ? "asc" : "desc",
  };

  const result = adminSearchVendors(filters);

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-warn">
          <Moon size={11} className="mr-1.5 inline -translate-y-px" />
          Sleep Overlay
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">
          Sleeping Vendors
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Hidden from the public site, search, and the main vendor list — but never
          deleted. Wake any vendor to restore it everywhere, exactly as it was.
        </p>
      </div>

      <VendorTable
        vendors={result.vendors}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        currentFilters={filters}
        mode="sleeping"
      />
    </div>
  );
}
