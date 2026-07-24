"use client";

import { useEffect } from "react";

/**
 * React 19 hydration strips attributes that aren't in the <html> JSX — which
 * removes the data-theme the pre-hydration flash script set. This re-applies
 * the stored theme once on mount (DOM-only sync; no state, no re-render).
 */
export function ThemeSync() {
  useEffect(() => {
    try {
      const t = window.localStorage.getItem("avl-theme");
      if (t === "light" || t === "dark") {
        document.documentElement.setAttribute("data-theme", t);
      }
    } catch {
      /* storage unavailable — stay on default theme */
    }
  }, []);
  return null;
}
