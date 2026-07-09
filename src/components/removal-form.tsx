"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { removalAction, type FormState } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "./ui";

/** CCPA/GDPR intake form: removal, correction, or do-not-sell/share. */
export function RemovalForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(removalAction, {});

  if (state.success) {
    return (
      <div className="anim-fade-up flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ok/40 bg-ok/10 text-ok">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="font-display text-lg font-semibold text-fg">Request logged</h3>
        <p className="max-w-sm text-sm text-fg-secondary">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="kind">Request type *</Label>
        <select
          id="kind"
          name="kind"
          required
          className="h-10 w-full cursor-pointer rounded-[10px] border border-line bg-surface-2 px-3 text-sm text-fg focus:border-arc/60 focus:outline-none"
        >
          <option value="remove">Remove my information</option>
          <option value="do-not-sell">Do not sell or share my information</option>
          <option value="correct">Correct my information</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">Your email *</Label>
          <Input id="email" name="email" type="email" required placeholder="you@company.com" />
        </div>
        <div>
          <Label htmlFor="company">Company (if applicable)</Label>
          <Input id="company" name="company" placeholder="Company name in our directory" />
        </div>
      </div>
      <div>
        <Label htmlFor="details">Which record or fields does this concern? *</Label>
        <Textarea
          id="details"
          name="details"
          required
          rows={4}
          placeholder="e.g. Please remove my direct phone number from the Acme Fabrication profile."
        />
      </div>
      {state.error && (
        <p className="anim-fade-in flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
        Submit request
      </Button>
      <p className="text-xs text-fg-muted">
        We confirm every request by email and process within 30 days. You can also write to{" "}
        <span className="font-mono">privacy@avlpoint.com</span>.
      </p>
    </form>
  );
}
