"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ButtonLink } from "./ui";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/search", label: "Find vendors" },
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export function Navbar({ sessionName }: { sessionName?: string | null }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || open ? "glass" : "bg-transparent"
      )}
    >
      {(scrolled || open) && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-arc/40 to-transparent"
          aria-hidden="true"
        />
      )}
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative rounded-lg px-3 py-2 text-sm transition-colors",
                pathname === l.href
                  ? "text-fg font-medium after:absolute after:inset-x-3 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-arc after:to-arc-deep"
                  : "text-fg-secondary hover:text-fg hover:bg-surface-2"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {sessionName ? (
            <ButtonLink href="/dashboard" variant="secondary" size="sm">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-fg-secondary transition-colors hover:text-fg"
              >
                Sign in
              </Link>
              <ButtonLink href="/signup" size="sm">
                Start free
              </ButtonLink>
            </>
          )}
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fg md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-6 pt-2 md:hidden anim-fade-in">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-3 text-base text-fg-secondary hover:bg-surface-2 hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-3 px-3">
            <ThemeToggle />
            {sessionName ? (
              <ButtonLink href="/dashboard" className="flex-1">
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="secondary" className="flex-1">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/signup" className="flex-1">
                  Start free
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
