"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** The <html data-theme> attribute is the single source of truth — set by the
    flash script, ThemeSync, and this toggle. A MutationObserver keeps the
    icon in sync no matter which one wrote it last. */
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

function getTheme(): "dark" | "light" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("avl-theme", next);
  }

  return (
    <button
      onClick={toggle}
      suppressHydrationWarning
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-fg-secondary transition-colors hover:border-arc/50 hover:text-fg"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
