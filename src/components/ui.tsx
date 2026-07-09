import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/* ---------------- Button ---------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-all duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-arc disabled:opacity-50 disabled:pointer-events-none " +
  "active:scale-[0.98] whitespace-nowrap cursor-pointer";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-arc to-arc-deep text-arc-ink font-semibold shadow-[0_4px_20px_-4px_var(--glow)] hover:shadow-[0_6px_28px_-4px_var(--glow)] hover:brightness-110",
  secondary:
    "border border-line-strong bg-surface-2 text-fg hover:border-arc/50 hover:bg-surface-3",
  ghost: "text-fg-secondary hover:text-fg hover:bg-surface-2",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

/* ---------------- Badge ---------------- */

type BadgeTone = "arc" | "ok" | "warn" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  arc: "bg-arc/10 text-arc border-arc/30",
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  neutral: "bg-surface-2 text-fg-secondary border-line",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Inputs ---------------- */

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[10px] border border-line bg-surface-2 px-3.5 text-sm text-fg",
        "placeholder:text-fg-muted transition-colors focus:border-arc/60 focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg",
        "placeholder:text-fg-muted transition-colors focus:border-arc/60 focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-fg-secondary", className)}
      {...props}
    />
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/* ---------------- Section heading ---------------- */

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("mb-12 max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && (
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-arc">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-fg-secondary">{subtitle}</p>}
    </div>
  );
}
