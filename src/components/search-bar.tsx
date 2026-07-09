"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "AISC-certified structural steel fabricators in Texas",
  "AS9100 precision machine shops for titanium parts",
  "ASME pressure vessel manufacturers near Ohio",
  "sheet metal fabricators with powder coating",
  "welding shops certified for AWS D1.5 bridge work",
];

export function SearchBar({
  size = "lg",
  defaultValue = "",
  autoNavigate = true,
  className,
}: {
  size?: "md" | "lg";
  defaultValue?: string;
  autoNavigate?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [placeholder, setPlaceholder] = useState("Describe the vendor you need…");
  const [focused, setFocused] = useState(false);
  const indexRef = useRef(0);

  // Rotating example placeholder (typewriter feel without the gimmick).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % EXAMPLES.length;
      setPlaceholder(`e.g. ${EXAMPLES[indexRef.current]}`);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!autoNavigate) return;
    // Remember recent searches for the dashboard.
    if (q) {
      try {
        const prev: string[] = JSON.parse(window.localStorage.getItem("avl-recent") ?? "[]");
        const next = [q, ...prev.filter((p) => p !== q)].slice(0, 8);
        window.localStorage.setItem("avl-recent", JSON.stringify(next));
      } catch {}
    }
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form onSubmit={submit} role="search" className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative flex items-center gap-3 rounded-2xl border bg-surface transition-all duration-300",
          size === "lg" ? "h-16 px-5" : "h-12 px-4",
          focused
            ? "border-arc/60 shadow-[0_0_0_4px_color-mix(in_srgb,var(--arc)_14%,transparent),0_8px_40px_-8px_var(--glow)]"
            : "border-line-strong shadow-[var(--shadow-card)]"
        )}
      >
        <Sparkles
          size={size === "lg" ? 20 : 16}
          className={cn("shrink-0 transition-colors", focused ? "text-arc" : "text-fg-muted")}
        />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label="Search vendors"
          className={cn(
            "h-full w-full bg-transparent text-fg placeholder:text-fg-muted focus:outline-none",
            size === "lg" ? "text-base" : "text-sm"
          )}
        />
        <button
          type="submit"
          aria-label="Search"
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-arc to-arc-deep font-semibold text-arc-ink transition-all hover:brightness-110 active:scale-95",
            size === "lg" ? "h-11 px-5 text-sm" : "h-8 px-3 text-xs"
          )}
        >
          {size === "lg" ? (
            <>
              Search <ArrowRight size={15} />
            </>
          ) : (
            <Search size={14} />
          )}
        </button>
      </div>
    </form>
  );
}
