"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { History, Search } from "lucide-react";

const emptySubscribe = () => () => {};

/** Reads the user's recent searches from localStorage (written by SearchBar).
    useSyncExternalStore: server snapshot renders the skeleton, the post-hydration
    client snapshot swaps in the real list — no effect, no mismatch. */
export function RecentSearches() {
  const raw = useSyncExternalStore(
    emptySubscribe,
    () => window.localStorage.getItem("avl-recent") ?? "[]",
    () => null
  );
  const items = useMemo<string[] | null>(() => {
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);

  if (items === null) {
    return <div className="skeleton h-24 rounded-xl" />;
  }
  if (items.length === 0) {
    return (
      <p className="text-sm italic text-fg-muted">
        Your searches will appear here.{" "}
        <Link href="/search" className="not-italic text-arc hover:underline">
          Run your first one
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((q) => (
        <li key={q}>
          <Link
            href={`/search?q=${encodeURIComponent(q)}`}
            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <History size={14} className="shrink-0 text-fg-muted" />
            <span className="truncate">{q}</span>
            <Search
              size={13}
              className="ml-auto shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
