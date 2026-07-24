"use client";

import { useActionState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { FormState } from "@/lib/actions";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

/**
 * Generic small form wrapper around a server action: renders children
 * (inputs), a submit button, and inline success/error states. Used across
 * sandbox, inspections, and admin so each micro-form stays one-liner-simple.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  size = "md",
  variant = "primary",
  inline = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className={cn(inline ? "flex flex-wrap items-end gap-2" : "space-y-3", className)}>
      {children}
      <Button type="submit" disabled={pending} size={size} variant={variant}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        {submitLabel}
      </Button>
      {state.error && (
        <p className="anim-fade-in flex w-full items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="anim-fade-in flex w-full items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {state.success}
        </p>
      )}
    </form>
  );
}
