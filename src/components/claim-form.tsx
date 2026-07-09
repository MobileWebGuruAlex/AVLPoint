"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, BadgeCheck } from "lucide-react";
import { claimAction, type FormState } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "./ui";

/** Claim-your-company form — files a claim for manual review (Trust Ladder rung 2). */
export function ClaimForm({ vendorId, vendorName }: { vendorId: number; vendorName: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(claimAction, {});

  if (state.success) {
    return (
      <div className="anim-fade-up flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-arc/40 bg-arc/10 text-arc">
          <BadgeCheck size={26} />
        </div>
        <h3 className="font-display text-lg font-semibold text-fg">Claim in review</h3>
        <p className="max-w-sm text-sm text-fg-secondary">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="vendor_id" value={vendorId} />
      <div>
        <Label htmlFor="work_email">Your work email at {vendorName} *</Label>
        <Input
          id="work_email"
          name="work_email"
          type="email"
          required
          placeholder="you@yourcompany.com"
        />
        <p className="mt-1.5 text-xs text-fg-muted">
          A company-domain email is the fastest path to approval.
        </p>
      </div>
      <div>
        <Label htmlFor="proof">Role & proof of affiliation (optional)</Label>
        <Textarea
          id="proof"
          name="proof"
          rows={3}
          placeholder="e.g. Operations Manager — happy to verify by phone or provide business registration."
        />
      </div>
      {state.error && (
        <p className="anim-fade-in flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
        Submit claim for review
      </Button>
    </form>
  );
}
