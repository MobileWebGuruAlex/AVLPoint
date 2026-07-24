"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Reads the theme the root-layout flash script already stamped on <html>,
    so no effect / double render — just hydrate from the attribute. */
function initialTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
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
