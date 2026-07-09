import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bookmark, Database, History, ShieldCheck, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getSavedVendors, getFeaturedVendors, getStats } from "@/lib/vendors";
import { formatNumber } from "@/lib/utils";
import { VendorCard } from "@/components/vendor-card";
import { RecentSearches } from "@/components/recent-searches";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [saved, recommended, stats] = await Promise.all([
    getSavedVendors(session.userId),
    getFeaturedVendors(3),
    getStats(),
  ]);

  const tiles = [
    { icon: Database, label: "Vendors indexed", value: formatNumber(stats.totalVendors) },
    { icon: ShieldCheck, label: "Verified profiles", value: formatNumber(stats.verifiedVendors) },
    { icon: Sparkles, label: "Tier 1 · enterprise-ready", value: formatNumber(stats.tier1Vendors) },
    { icon: Bookmark, label: "On your shortlist", value: formatNumber(saved.length) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="anim-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Dashboard</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg">
            Welcome back, {session.name}
          </h1>
        </div>
        <div className="w-full sm:w-96">
          <SearchBar size="md" />
        </div>
      </div>

      {/* Stats tiles */}
      <div className="anim-fade-up delay-1 mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <t.icon size={17} className="text-arc" />
            <p className="mt-3 font-mono text-2xl font-semibold text-fg">{t.value}</p>
            <p className="mt-1 text-xs text-fg-secondary">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {/* Shortlist */}
          <section className="anim-fade-up delay-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
                <Bookmark size={17} className="text-arc" /> Your shortlist
              </h2>
              {saved.length > 0 && (
                <Link
                  href="/dashboard/saved"
                  className="flex items-center gap-1 text-sm text-arc hover:underline"
                >
                  View all <ArrowRight size={13} />
                </Link>
              )}
            </div>
            {saved.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={24} />}
                title="No vendors shortlisted yet"
                description="Search the database and add promising vendors to build your approved vendor list."
                action={{ href: "/search", label: "Find vendors" }}
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {saved.slice(0, 4).map((v) => (
                  <VendorCard key={v.id} vendor={v} />
                ))}
              </div>
            )}
          </section>

          {/* AI recommendations */}
          <section className="anim-fade-up delay-3">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
              <Sparkles size={17} className="text-arc" /> Recommended for you
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {recommended.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="card anim-fade-up delay-2 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
              <History size={15} className="text-arc" /> Recent searches
            </h2>
            <RecentSearches />
          </div>
          <div className="card anim-fade-up delay-3 p-5">
            <h2 className="font-display text-base font-semibold text-fg">Database status</h2>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs text-fg-muted">
              <span className="status-dot" /> discovery & enrichment pipeline active
            </p>
            <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
              New vendors are discovered and enriched continuously across{" "}
              {formatNumber(stats.sources)} sources.
            </p>
            <ButtonLink href="/product" variant="secondary" size="sm" className="mt-4 w-full">
              How the pipeline works
            </ButtonLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
