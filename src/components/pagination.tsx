"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function go(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const btn =
    "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border border-line px-2 text-sm transition-colors hover:border-arc/50 hover:text-fg disabled:opacity-40 disabled:pointer-events-none";

  // Compact window of page numbers around the current page.
  const windowPages = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
      <button className={cn(btn, "text-fg-secondary")} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page">
        <ChevronLeft size={15} />
      </button>
      {windowPages.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && windowPages[i - 1] < p - 1 && (
            <span className="px-1 text-fg-muted">…</span>
          )}
          <button
            onClick={() => go(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              btn,
              "font-mono",
              p === page ? "border-arc/60 bg-arc/10 text-arc" : "text-fg-secondary"
            )}
          >
            {formatNumber(p)}
          </button>
        </span>
      ))}
      <button className={cn(btn, "text-fg-secondary")} disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page">
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}
