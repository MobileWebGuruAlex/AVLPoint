import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, LogOut, Palette, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Account</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg">Settings</h1>

      <div className="mt-8 space-y-5">
        <section className="card anim-fade-up p-6">
          <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold text-fg">
            <UserRound size={16} className="text-arc" /> Profile
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-fg-muted">Name</p>
              <p className="mt-0.5 text-sm font-medium text-fg">{session.name}</p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Email</p>
              <p className="mt-0.5 text-sm font-medium text-fg">{session.email}</p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Role</p>
              <p className="mt-0.5 text-sm font-medium capitalize text-fg">{session.role}</p>
            </div>
          </div>
        </section>

        <section className="card anim-fade-up delay-1 p-6">
          <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold text-fg">
            <Palette size={16} className="text-arc" /> Appearance
          </h2>
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg-secondary">
              Toggle between the dark precision theme and the light enterprise theme.
            </p>
            <ThemeToggle />
          </div>
        </section>

        <section className="card anim-fade-up delay-2 p-6">
          <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold text-fg">
            <CreditCard size={16} className="text-arc" /> Plan
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Badge tone="arc">Explorer · Free</Badge>
              <span className="text-sm text-fg-secondary">Full search, 25 profile views / month</span>
            </div>
            <ButtonLink href="/pricing" variant="secondary" size="sm">
              Upgrade
            </ButtonLink>
          </div>
        </section>

        <section className="card anim-fade-up delay-3 p-6">
          <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold text-fg">
            <LogOut size={16} className="text-arc" /> Session
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-secondary">Sign out of this device.</p>
            <form action={logoutAction}>
              <Button type="submit" variant="danger" size="sm">
                <LogOut size={14} /> Sign out
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
