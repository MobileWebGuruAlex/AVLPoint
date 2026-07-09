import type { Metadata } from "next";
import { Suspense } from "react";
import { Zap } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { AiRecommend } from "@/components/ai-recommend";
import { Filters } from "@/components/filters";
import { VendorCard, VendorCardSkeleton } from "@/components/vendor-card";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { searchVendors, getFacets, type SearchFilters } from "@/lib/vendors";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find vendors",
  description:
    "Search 85,000+ industrial vendors by capability, certification, location, and enterprise readiness.",
};

type SP = { [key: string]: string | string[] | undefined };

function parseFilters(sp: SP): SearchFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return {
    q: s("q"),
    country: s("country"),
    type: s("type"),
    cert: s("cert"),
    tier: s("tier") ? Number(s("tier")) : undefined,
    verified: s("verified") === "1",
    sort: (s("sort") as SearchFilters["sort"]) ?? "relevance",
    page: s("page") ? Math.max(1, Number(s("page"))) : 1,
  };
}

const SORTS: { value: string; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "tier", label: "Enterprise tier" },
  { value: "name", label: "Name A–Z" },
  { value: "updated", label: "Recently updated" },
];

async function Results({ filters }: { filters: SearchFilters }) {
  const result = await searchVendors(filters);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-secondary">
          <span className="font-mono font-semibold text-fg">{formatNumber(result.total)}</span>{" "}
          vendors{filters.q ? <> matching &ldquo;{filters.q}&rdquo;</> : null}
          <span className="ml-2 inline-flex items-center gap-1 font-mono text-xs text-fg-muted">
            <Zap size={11} className="text-arc" />
            {result.tookMs}ms{result.usedFts ? " · ranked" : ""}
          </span>
        </p>
        <form method="GET" className="flex items-center gap-2">
          {/* Preserve current params while changing sort */}
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          {filters.country && <input type="hidden" name="country" value={filters.country} />}
          {filters.type && <input type="hidden" name="type" value={filters.type} />}
          {filters.cert && <input type="hidden" name="cert" value={filters.cert} />}
          {filters.tier && <input type="hidden" name="tier" value={filters.tier} />}
          {filters.verified && <input type="hidden" name="verified" value="1" />}
          <label htmlFor="sort" className="text-xs text-fg-muted">
            Sort
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={filters.sort}
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface-2 px-2.5 text-sm text-fg focus:border-arc/60 focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-lg border border-line px-3 text-sm text-fg-secondary transition-colors hover:border-arc/50 hover:text-fg"
          >
            Apply
          </button>
        </form>
      </div>

      {result.vendors.length === 0 ? (
        <EmptyState
          title="No vendors matched"
          description="Try fewer filters, a broader phrase, or a capability keyword like “laser cutting” or “ASME”."
          action={{ href: "/search", label: "Clear search" }}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.vendors.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      )}

      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <VendorCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const facets = await getFacets();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-arc">
          Live database
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Intelligent vendor search
        </h1>
        <p className="mt-3 text-sm text-fg-secondary sm:text-base">
          Ranked full-text search across summaries, capabilities, equipment, and certifications.
        </p>
        <div className="mt-6">
          <SearchBar size="md" defaultValue={filters.q ?? ""} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Filters facets={facets} />
        <div>
          {filters.q && <AiRecommend query={filters.q} />}
          <Suspense key={JSON.stringify(sp)} fallback={<ResultsSkeleton />}>
            <Results filters={filters} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
