"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { loginAction, signupAction, type FormState } from "@/lib/actions";
import { Button, Input, Label } from "./ui";
import { LogoMark } from "./logo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <div className="glass-panel gradient-ring anim-fade-up relative w-full max-w-md overflow-hidden p-8">
      <div className="beam absolute inset-x-0 top-0" />
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={40} />
        <h1 className="mt-4 font-display text-2xl font-bold text-fg">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1.5 text-sm text-fg-secondary">
          {mode === "login"
            ? "Sign in to your vendor intelligence workspace."
            : "Free to start. Search the full database immediately."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "signup" && (
          <div>
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" name="first_name" placeholder="Alex" autoComplete="given-name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="text"
            required
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {mode === "signup" && (
          <div>
            <Label>I am a…</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg has-checked:border-arc/60 has-checked:bg-arc/10">
                <input type="radio" name="role" value="buyer" defaultChecked className="accent-(--arc)" />
                Buyer / Procurement
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg has-checked:border-arc/60 has-checked:bg-arc/10">
                <input type="radio" name="role" value="vendor" className="accent-(--arc)" />
                Vendor / Supplier
              </label>
            </div>
          </div>
        )}

        {state.error && (
          <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger anim-fade-in">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full" size="lg">
          {pending && <Loader2 size={16} className="animate-spin" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>

        {mode === "signup" && (
          <p className="text-center text-xs leading-relaxed text-fg-muted">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="text-arc hover:underline">
              Terms of Service
            </Link>{" "}
            (including its no-scraping clause) and the{" "}
            <Link href="/privacy" className="text-arc hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-fg-secondary">
        {mode === "login" ? (
          <>
            New to AVLpoint?{" "}
            <Link href="/signup" className="font-medium text-arc hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-arc hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
