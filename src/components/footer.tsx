import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/search", label: "Vendor search" },
      { href: "/product", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Documentation" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Create account" },
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/claim", label: "Claim your company" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/do-not-sell", label: "Do Not Sell / Removal" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <div className="beam absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] max-md:[&>div:first-child]:col-span-2">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-secondary">
              AI-powered vendor discovery for industrial procurement. 85,000+ suppliers,
              verified against 14 authoritative sources.
            </p>
            <p className="mt-5 flex items-center gap-2 font-mono text-xs text-fg-muted">
              <span className="status-dot" />
              Vendor database syncing continuously
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-sm font-semibold text-fg">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-fg-secondary transition-colors hover:text-arc"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-fg-muted">
            © {new Date().getFullYear()} AVLpoint. All rights reserved.
          </p>
          <p className="font-mono text-xs text-fg-muted">
            avlpoint.com · precision vendor intelligence
          </p>
        </div>
      </div>
      <p
        className="watermark pointer-events-none relative -mb-[0.16em] select-none text-center font-display text-[clamp(4rem,15vw,13rem)] font-bold tracking-tight"
        aria-hidden="true"
      >
        AVLpoint
      </p>
    </footer>
  );
}
