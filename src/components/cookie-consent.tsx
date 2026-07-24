"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cookie consent — honest and minimal, matching the legal plan:
 * AVLpoint sets one essential auth cookie and local preferences only.
 * Choice is stored in localStorage so the card never nags again.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("avl-consent")) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem("avl-consent", JSON.stringify({ choice: "accepted", at: Date.now() }));
    } catch {}
    setLeaving(true);
    setTimeout(() => setVisible(false), 380);
  }

  if (!visible) return null;

  return (
    <div
      className={cn("consent-card glass-panel gradient-ring p-4 sm:p-5", leaving && "consent-out")}
      role="region"
      aria-label="Cookie notice"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-arc/25 bg-arc/10 text-arc">
          <Cookie size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Cookies, the honest version</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">
            One essential cookie keeps you signed in; your preferences stay in your browser.
            No ad trackers, no analytics resale, no third parties. Details in the{" "}
            <Link href="/privacy" className="text-arc hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acknowledge}
              className="h-9 cursor-pointer rounded-[10px] bg-gradient-to-r from-arc to-arc-deep px-4 text-xs font-semibold text-arc-ink transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Accept & continue
            </button>
            <Link
              href="/do-not-sell"
              className="px-2 py-2 text-xs text-fg-muted transition-colors hover:text-fg"
            >
              Privacy choices
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
