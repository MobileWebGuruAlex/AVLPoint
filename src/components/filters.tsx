"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Facets } from "@/lib/vendors";
import { cn, formatNumber } from "@/lib/utils";

function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold text-fg"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          size={15}
          className={cn("text-fg-muted transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && <div className="mt-3 space-y-1.5 anim-fade-in">{children}</div>}
    </div>
  );
}

function FilterOption({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        active ? "bg-arc/10 font-medium text-arc" : "text-fg-secondary hover:bg-surface-2 hover:text-fg"
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="ml-2 shrink-0 font-mono text-xs text-fg-muted">{formatNumber(count)}</span>
      )}
    </button>
  );
}

export function Filters({ facets }: { facets: Facets }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || params.get(key) === value) next.delete(key);
      else next.set(key, value);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router]
  );

  const activeCount = ["country", "type", "tier", "cert", "verified"].filter((k) =>
    params.get(k)
  ).length;

  const body = (
    <>
      <div className="flex items-center justify-between pb-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <SlidersHorizontal size={14} className="text-arc" /> Filters
        </p>
        {activeCount > 0 && (
          <button
            onClick={() => router.push(params.get("q") ? `${pathname}?q=${encodeURIComponent(params.get("q")!)}` : pathname)}
            className="flex cursor-pointer items-center gap-1 text-xs text-fg-muted transition-colors hover:text-danger"
          >
            <RotateCcw size={12} /> Reset ({activeCount})
          </button>
        )}
      </div>

      <FilterGroup title="Vendor quality">
        <FilterOption
          label="Verified profiles only"
          active={params.get("verified") === "1"}
          onClick={() => setParam("verified", "1")}
        />
        <FilterOption
          label="Tier 1 · Enterprise-ready"
          active={params.get("tier") === "1"}
          onClick={() => setParam("tier", "1")}
        />
        <FilterOption
          label="Tier 2 · Established"
          active={params.get("tier") === "2"}
          onClick={() => setParam("tier", "2")}
        />
      </FilterGroup>

      <FilterGroup title="Business type">
        {facets.businessTypes.slice(0, 10).map((t) => (
          <FilterOption
            key={t.value}
            label={t.value}
            count={t.count}
            active={params.get("type") === t.value}
            onClick={() => setParam("type", t.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Certifications">
        {facets.certifications.map((c) => (
          <FilterOption
            key={c.value}
            label={c.value}
            count={c.count}
            active={params.get("cert") === c.value}
            onClick={() => setParam("cert", c.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Country">
        {facets.countries.slice(0, 10).map((c) => (
          <FilterOption
            key={c.value}
            label={c.value}
            count={c.count}
            active={params.get("country") === c.value}
            onClick={() => setParam("country", c.value)}
          />
        ))}
      </FilterGroup>
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium text-fg lg:hidden"
      >
        <SlidersHorizontal size={15} className="text-arc" />
        Filters {activeCount > 0 && `(${activeCount})`}
      </button>
      <aside
        className={cn(
          "card h-fit p-4 lg:sticky lg:top-20 lg:block",
          mobileOpen ? "block anim-fade-in" : "hidden"
        )}
        aria-label="Search filters"
      >
        {body}
      </aside>
    </>
  );
}
