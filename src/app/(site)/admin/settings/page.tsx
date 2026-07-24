import type { Metadata } from "next";
import Link from "next/link";
import {
  DatabaseBackup, ShieldCheck, ShieldAlert, TerminalSquare, HardDriveDownload,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { listBackups, getSecurityPosture } from "@/lib/backup";
import { runBackupAction } from "@/lib/user-actions";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session || !can(session.role, "settings.view")) return null;
  const canBackup = can(session.role, "backups.run");

  const posture = getSecurityPosture();
  const backups = listBackups();
  const externalDir = process.env.BACKUP_EXTERNAL_DIR;

  const checks: { label: string; ok: boolean; detail: string }[] = [
    {
      label: "Session secret",
      ok: posture.authSecretStrong,
      detail: posture.authSecretStrong
        ? "AUTH_SECRET is set to a strong value; production refuses weak/default secrets."
        : "AUTH_SECRET is weak or missing — set a 32+ char random value in .env.",
    },
    {
      label: "Default credentials",
      ok: true,
      detail: "No hardcoded logins exist. Staff access comes only from database roles; break-glass via scripts/create-admin.mjs on the server shell.",
    },
    {
      label: "Super admin coverage",
      ok: posture.superAdmins >= 1,
      detail: `${posture.superAdmins} active super admin${posture.superAdmins === 1 ? "" : "s"} — the last one can never be demoted, disabled, or slept.`,
    },
    {
      label: "Revocable sessions",
      ok: true,
      detail: `${posture.activeSessions} active session${posture.activeSessions === 1 ? "" : "s"}. Sessions are server-side rows; disabling a user or changing a staff role revokes them instantly.`,
    },
    {
      label: "Login throttling",
      ok: true,
      detail: `${posture.failedLogins24h} failed attempt${posture.failedLogins24h === 1 ? "" : "s"} in the last 24 h. Five failures per account (25 per IP) in 15 minutes locks sign-in.`,
    },
    {
      label: "Audit trail",
      ok: posture.auditEvents > 0,
      detail: `${formatNumber(posture.auditEvents)} events recorded — auth, role changes, sleep/wake, edits, deletes, backups.`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Platform Operations</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">Settings &amp; Safety</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Signed in as {session.email} · {ROLE_LABELS[session.role]}
        </p>
      </div>

      {/* Security posture */}
      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <ShieldCheck size={15} className="text-arc" /> Security posture
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3 rounded-xl border border-line p-3.5">
              {c.ok
                ? <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                : <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />}
              <div>
                <p className="text-sm font-medium text-fg">{c.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="neutral">{posture.staffAccounts} staff accounts</Badge>
          <Badge tone="neutral">{posture.disabledUsers} disabled users</Badge>
          <Badge tone="neutral">{formatNumber(posture.sleepingVendors)} sleeping vendors</Badge>
        </div>
      </section>

      {/* Backups */}
      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <DatabaseBackup size={15} className="text-arc" /> Database backups
        </h2>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-fg-muted">
          Uses SQLite&apos;s online backup API — safe while the discovery pipeline is writing. Files land in{" "}
          <code className="rounded bg-surface-2 px-1 font-mono">backups/site/</code>
          {externalDir ? (
            <> and are mirrored to <code className="rounded bg-surface-2 px-1 font-mono">{externalDir}</code>.</>
          ) : (
            <>. Set <code className="rounded bg-surface-2 px-1 font-mono">BACKUP_EXTERNAL_DIR</code> in .env to mirror copies off-disk.</>
          )}
        </p>

        {canBackup ? (
          <ActionForm action={runBackupAction} submitLabel="Run backup now" size="sm" variant="secondary" />
        ) : (
          <p className="text-xs italic text-fg-muted">Running backups requires the Ops Admin role.</p>
        )}

        <div className="mt-5 space-y-1.5">
          {backups.length === 0 && (
            <p className="text-sm italic text-fg-muted">No backups yet — run the first one now.</p>
          )}
          {backups.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <span className="flex items-center gap-2 font-mono text-fg-secondary">
                <HardDriveDownload size={13} className="text-fg-muted" /> {b.name}
              </span>
              <span className="font-mono text-fg-muted">
                {(b.sizeBytes / 1024 / 1024).toFixed(1)} MB · {b.createdAt.slice(0, 16).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-warn/30 bg-warn/5 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-warn">
            <TerminalSquare size={13} /> Restore runbook (deliberately not a button)
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-fg-secondary">
            <li>Stop the Next.js server and the Python discovery pipeline.</li>
            <li>In the project root, move <code className="font-mono">vendors.db</code>, <code className="font-mono">vendors.db-wal</code>, <code className="font-mono">vendors.db-shm</code> aside (they are your undo).</li>
            <li>Copy the chosen backup file to <code className="font-mono">vendors.db</code>.</li>
            <li>Restart both processes — WAL/SHM files regenerate automatically.</li>
          </ol>
        </div>
      </section>

      {/* Break-glass */}
      <section className="card p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <TerminalSquare size={15} className="text-arc" /> Break-glass access
        </h2>
        <p className="max-w-2xl text-xs leading-relaxed text-fg-muted">
          If every staff account is locked out, run{" "}
          <code className="rounded bg-surface-2 px-1 font-mono">node scripts/create-admin.mjs you@email.com --role super_admin --reset-password</code>{" "}
          on the server. It requires shell access, prints a one-time temporary password, and writes an audit row —
          there are no in-app backdoors to abuse. Manage day-to-day access from{" "}
          <Link href="/admin/users" className="text-arc hover:underline">Users &amp; Roles</Link>.
        </p>
      </section>
    </div>
  );
}
