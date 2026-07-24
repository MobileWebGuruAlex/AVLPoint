import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck, MailX } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getInvitation, isInvitationUsable } from "@/lib/users-admin";
import { acceptInviteAction } from "@/lib/actions";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { ActionForm } from "@/components/action-form";
import { Badge, Input, Label } from "@/components/ui";
import { Aurora } from "@/components/aurora";

export const metadata: Metadata = { title: "Accept invitation" };

interface Props { params: Promise<{ token: string }> }

export default async function InvitePage({ params }: Props) {
  if (await getSession()) redirect("/dashboard");
  const { token } = await params;
  const invitation = getInvitation(token);

  const invalid = !isInvitationUsable(invitation);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
      <Aurora />
      <div className="bg-grid bg-radial-fade absolute inset-0" aria-hidden="true" />

      <div className="card relative z-10 w-full max-w-md p-8">
        {invalid ? (
          <div className="text-center">
            <MailX size={28} className="mx-auto text-warn" />
            <h1 className="mt-3 font-display text-xl font-bold text-fg">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-fg-secondary">
              This link is invalid, expired, or was already used. Ask the person who invited you to send a new one.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <MailCheck size={28} className="mx-auto text-arc" />
              <h1 className="mt-3 font-display text-xl font-bold text-fg">You&apos;re invited to AVLpoint</h1>
              <p className="mt-2 text-sm text-fg-secondary">
                Create the account for <span className="font-medium text-fg">{invitation.email}</span>
              </p>
              <div className="mt-2">
                <Badge tone="arc">{ROLE_LABELS[invitation.role as Role] ?? invitation.role}</Badge>
              </div>
            </div>

            <ActionForm action={acceptInviteAction} submitLabel="Create account &amp; sign in" size="lg">
              <input type="hidden" name="token" value={invitation.token} />
              <div>
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" placeholder="Your name" autoComplete="given-name" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required minLength={10}
                  placeholder="At least 10 characters" autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="confirm_password">Confirm password</Label>
                <Input id="confirm_password" name="confirm_password" type="password" required
                  autoComplete="new-password" />
              </div>
            </ActionForm>

            <p className="mt-4 text-center font-mono text-[10px] text-fg-muted">
              Invited by {invitation.invited_by} · expires {invitation.expires_at?.slice(0, 10)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
