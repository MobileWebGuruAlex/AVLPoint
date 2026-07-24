"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { verifyClaimAction } from "@/lib/platform-actions";
import type { FormState } from "@/lib/actions";
import { Button } from "@/components/ui";

/**
 * Shown to a user with a pending claim on this vendor. Gives them the
 * website token to place, then a one-click "check my site now" button that
 * fetches their site server-side and grants ownership if found.
 */
export function ClaimVerifyPanel({
  vendorId,
  token,
  website,
}: {
  vendorId: number;
  token: string | null;
  website: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(verifyClaimAction, {});
  const [copied, setCopied] = useState(false);

  if (!token) {
    return (
      <div className="mt-4 rounded-2xl border border-arc/30 bg-arc/5 p-5">
        <p className="text-sm text-fg-secondary">
          Your claim is in AVLpoint&apos;s manual review queue — we&apos;ll approve it within 1–2 business days.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-arc/30 bg-arc/5 p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-fg">
        <ShieldCheck size={17} className="text-arc" /> Verify you own this company
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">
        Prove control of the company website and get approved instantly. Place this code anywhere on
        {website ? <> <span className="font-medium text-fg">{website}</span></> : " your website"} — in the
        homepage HTML (a meta tag, footer, or comment) or in a file at{" "}
        <span className="font-mono text-xs text-fg">/avlpoint-verify.txt</span> — then check below.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-fg">
          {token}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(token);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-arc/50"
        >
          {copied ? <CheckCircle2 size={13} className="text-ok" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="vendor_id" value={vendorId} />
        <Button type="submit" disabled={pending} size="sm">
          {pending && <Loader2 size={14} className="animate-spin" />}
          Check my website now
        </Button>
      </form>

      {state.error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {state.success}
        </p>
      )}
    </div>
  );
}
