"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { contactAction, type FormState } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "./ui";

export function ContactForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(contactAction, {});

  if (state.success) {
    return (
      <div className="anim-fade-up flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ok/40 bg-ok/10 text-ok">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="font-display text-lg font-semibold text-fg">Message sent</h3>
        <p className="max-w-sm text-sm text-fg-secondary">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Alex Rivera" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="email">Work email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Topic</Label>
        <select
          id="subject"
          name="subject"
          className="h-10 w-full cursor-pointer rounded-[10px] border border-line bg-surface-2 px-3 text-sm text-fg focus:border-arc/60 focus:outline-none"
        >
          <option>Enterprise & API access</option>
          <option>Claim a vendor profile</option>
          <option>Data correction</option>
          <option>Partnership</option>
          <option>Something else</option>
        </select>
      </div>
      <div>
        <Label htmlFor="message">Message *</Label>
        <Textarea id="message" name="message" required rows={5} placeholder="Tell us what you need…" />
      </div>
      {state.error && (
        <p className="anim-fade-in flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
        Send message
      </Button>
    </form>
  );
}
