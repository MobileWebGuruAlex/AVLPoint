"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, CheckCircle2, Zap, ClipboardList, Download,
  ArrowLeft, ShieldCheck, Users, Landmark, HardHat, Settings, Menu, X, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  vendors: Building2,
  sleeping: Moon,
  approval: CheckCircle2,
  bulk: Zap,
  users: Users,
  enterprises: Landmark,
  inspectors: HardHat,
  audit: ClipboardList,
  export: Download,
  settings: Settings,
} as const;

export interface AdminNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

/**
 * Responsive admin chrome: fixed sidebar ≥lg, slide-over drawer below.
 * Nav items arrive pre-filtered by the server layout according to the
 * viewer's permissions — this component only renders.
 */
export function AdminShell({
  nav,
  email,
  roleLabel,
  children,
}: {
  nav: AdminNavItem[];
  email: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Longest matching href wins so nested routes (/admin/vendors/sleeping)
  // highlight their own nav item, not their parent's.
  const bestMatch = nav.reduce<string | null>((best, item) => {
    const hit = pathname === item.href || pathname.startsWith(item.href + "/");
    if (!hit) return best;
    return !best || item.href.length > best.length ? item.href : best;
  }, null);

  const items = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === bestMatch;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-arc/10 font-medium text-arc"
                : "text-fg-secondary hover:bg-surface-2 hover:text-fg"
            )}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-line px-4 py-3">
      <p className="truncate font-mono text-[10px] text-fg-muted">{email}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-arc">{roleLabel}</p>
      <Link
        href="/"
        className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-arc"
      >
        <ArrowLeft size={12} /> Back to site
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface pt-16 lg:flex">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <ShieldCheck size={18} className="text-arc" />
          <span className="font-display text-sm font-bold text-fg">Admin Portal</span>
        </div>
        {items()}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-16 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-arc" />
          <span className="font-display text-sm font-bold text-fg">Admin Portal</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Open admin menu"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-arc" />
                <span className="font-display text-sm font-bold text-fg">Admin Portal</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-fg-secondary hover:bg-surface-2 hover:text-fg"
                aria-label="Close admin menu"
              >
                <X size={16} />
              </button>
            </div>
            {items(() => setOpen(false))}
            {footer}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="mt-16 min-w-0 flex-1 px-4 py-6 sm:px-6 lg:ml-60 lg:mt-0 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  );
}
