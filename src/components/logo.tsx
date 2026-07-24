import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="avl-arc" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--arc)" />
          <stop offset="1" stopColor="var(--arc-deep)" />
        </linearGradient>
      </defs>
      <path
        d="M32 3.5 L56.5 17.75 V46.25 L32 60.5 L7.5 46.25 V17.75 Z"
        stroke="url(#avl-arc)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M32 21.5 L43.5 48 H37.6 L32 34.4 L26.4 48 H20.5 Z" fill="url(#avl-arc)" />
      <circle cx="32" cy="15.5" r="3.4" fill="var(--arc)" />
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <Link
      href="/home"
      className={cn("group inline-flex items-center gap-2.5 select-none", className)}
      aria-label="AVLpoint home"
    >
      <LogoMark size={size} className="transition-transform duration-300 group-hover:rotate-[8deg]" />
      <span className="font-display text-xl font-bold tracking-tight text-fg">
        AVL<span className="text-arc">point</span>
      </span>
    </Link>
  );
}
