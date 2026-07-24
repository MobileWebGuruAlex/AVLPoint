import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck, ClipboardCheck, ShieldAlert, Trash2,
  Building2, CheckCircle2, Zap, TrendingUp,
  Database, Moon, Users,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isAdminSession, listPendingClaims, listInspectors,
  listAuditRequests, ensurePlatformTables,
} from "@/lib/platform";
import { can } from "@/lib/rbac";
import { resolveClaimAction } from "@/lib/platform-actions";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui";
import { getAdminStats, getAdminActions } from "@/lib/admin";
import { userStats } from "@/lib/users-admin";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin Dashboard — AVLpoint" };

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminSession(session)) return null;
  ensurePlatformTables();

  const stats = getAdminStats();
  const accountStats = userStats();
  const { actions: recentActions } = getAdminActions(1, 15);
  const claims = listPendingClaims();
  const pendingInspectors = listInspectors(false).filter((i) => i.status === "pending");
  const audits = listAuditRequests();
  let removals: { id: string; kind: string; email: string; details: string; status: string; created_at: string }[] = [];
  try {
    removals = db.prepare("SELECT * FROM removal_requests WHERE status = 'open' ORDER BY created_at LIMIT 50").all() as typeof removals;
  } catch { /* table appears after first request */ }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Operations</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatNumber(stats.total)} vendors · Logged in as {session.email}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} icon={Database} />
        <StatCard
          label="Tier 1"
          value={stats.byTier.find((t) => t.tier === 1)?.count ?? 0}
          icon={TrendingUp}
          tone="ok"
        />
        <StatCard
          label="Tier 2"
          value={stats.byTier.find((t) => t.tier === 2)?.count ?? 0}
          icon={Building2}
          tone="arc"
        />
        <StatCard
          label="Tier 3"
          value={stats.byTier.find((t) => t.tier === 3)?.count ?? 0}
          icon={Building2}
          tone="warn"
        />
        <StatCard label="Sleeping" value={stats.sleeping} icon={Moon} tone={stats.sleeping > 0 ? "warn" : "neutral"} />
        <StatCard label="Accounts" value={accountStats.total} icon={Users} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/vendors"
          className="card flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-arc/40"
        >
          <Building2 size={15} className="text-arc" /> Browse Vendors
        </Link>
        <Link
          href="/admin/approval"
          className="card flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-arc/40"
        >
          <CheckCircle2 size={15} className="text-ok" /> Review Queue
        </Link>
        <Link
          href="/admin/bulk"
          className="card flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-arc/40"
        >
          <Zap size={15} className="text-warn" /> Bulk Operations
        </Link>
        <Link
          href="/admin/users"
          className="card flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-arc/40"
        >
          <Users size={15} className="text-arc" /> Users &amp; Roles
        </Link>
        <Link
          href="/admin/vendors?state=sleeping"
          className="card flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-arc/40"
        >
          <Moon size={15} className="text-warn" /> Sleeping Vendors
        </Link>
      </div>

      {/* Distribution breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lifecycle funnel */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-fg">Lifecycle Distribution</h2>
          <div className="space-y-2">
            {stats.byLifecycle.map((s) => (
              <BarRow
                key={s.stage}
                label={s.stage}
                count={s.count}
                total={stats.total}
                tone={
                  s.stage === "locked" ? "ok" :
                  s.stage === "disqualified" ? "danger" :
                  s.stage === "fully_built" ? "arc" : "neutral"
                }
              />
            ))}
          </div>
        </section>

        {/* Tier breakdown */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-fg">Enterprise Tier</h2>
          <div className="space-y-2">
            {stats.byTier.map((t) => (
              <BarRow
                key={t.tier}
                label={`Tier ${t.tier}${t.tier === 0 ? " (unassessed)" : t.tier === 1 ? " (enterprise)" : t.tier === 2 ? " (regional)" : " (small/unclear)"}`}
                count={t.count}
                total={stats.total}
                tone={t.tier === 1 ? "ok" : t.tier === 2 ? "arc" : t.tier === 3 ? "warn" : "neutral"}
              />
            ))}
          </div>
        </section>

        {/* Top countries */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-fg">Top Countries</h2>
          <div className="space-y-1.5">
            {stats.topCountries.slice(0, 8).map((c) => (
              <div key={c.country} className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">{c.country}</span>
                <span className="font-mono text-xs text-fg-muted">{formatNumber(c.count)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top business types */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold text-fg">Top Business Types</h2>
          <div className="space-y-1.5">
            {stats.topBusinessTypes.slice(0, 8).map((b) => (
              <div key={b.type} className="flex items-center justify-between text-sm">
                <span className="truncate text-fg-secondary">{b.type}</span>
                <span className="ml-2 shrink-0 font-mono text-xs text-fg-muted">{formatNumber(b.count)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent admin activity */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-sm font-semibold text-fg">Recent Admin Activity</h2>
        {recentActions.length === 0 && (
          <p className="text-sm italic text-fg-muted">No actions logged yet.</p>
        )}
        <div className="space-y-1.5">
          {recentActions.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge tone={
                  a.action_type.includes("approve") || a.action_type === "edit" ? "ok" :
                  a.action_type.includes("delete") || a.action_type.includes("reject") ? "warn" : "arc"
                }>
                  {a.action_type}
                </Badge>
                <span className="text-fg-secondary">
                  {a.target_vendor_name ? `${a.target_vendor_name}` : ""}
                </span>
              </div>
              <span className="shrink-0 font-mono text-fg-muted">{a.created_at?.slice(0, 16)}</span>
            </div>
          ))}
        </div>
        {recentActions.length > 0 && (
          <Link href="/admin/audit" className="mt-3 inline-block text-xs text-arc hover:underline">
            View full audit log →
          </Link>
        )}
      </section>

      {/* ============ Existing review queues (preserved) ============ */}

      {/* Claims */}
      <section className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <BadgeCheck size={17} className="text-arc" /> Profile claims ({claims.length})
        </h2>
        {claims.length === 0 && <p className="text-sm italic text-fg-muted">Queue is clear.</p>}
        <div className="space-y-3">
          {claims.map((c) => (
            <div key={c.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/vendors/${c.vendor_id}`} className="font-display text-sm font-semibold text-fg hover:text-arc">
                    {c.company_name ?? `Vendor #${c.vendor_id}`}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">{c.work_email} · {c.created_at?.slice(0, 10)}</p>
                  {c.proof_note && <p className="mt-1 text-xs text-fg-secondary">{c.proof_note}</p>}
                </div>
                <div className="flex gap-2">
                  <ActionForm action={resolveClaimAction} submitLabel="Approve" size="sm" inline>
                    <input type="hidden" name="claim_id" value={c.id} />
                    <input type="hidden" name="decision" value="approve" />
                  </ActionForm>
                  <ActionForm action={resolveClaimAction} submitLabel="Reject" size="sm" variant="danger" inline>
                    <input type="hidden" name="claim_id" value={c.id} />
                    <input type="hidden" name="decision" value="reject" />
                  </ActionForm>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Inspector applications */}
      <section className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <ClipboardCheck size={17} className="text-arc" /> Inspector applications ({pendingInspectors.length})
        </h2>
        {pendingInspectors.length === 0 && <p className="text-sm italic text-fg-muted">Queue is clear.</p>}
        <div className="space-y-2">
          {pendingInspectors.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-4">
              <div>
                <p className="font-display text-sm font-semibold text-fg">{i.company}</p>
                <p className="font-mono text-xs text-fg-muted">{[i.credentials, i.regions, i.base_price].filter(Boolean).join(" · ")}</p>
              </div>
              <ApproveInspector id={i.id} />
            </div>
          ))}
        </div>
      </section>

      {/* Audit requests */}
      <section className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <ShieldAlert size={17} className="text-arc" /> Enterprise audit requests ({audits.length})
        </h2>
        {audits.length === 0 && <p className="text-sm italic text-fg-muted">None.</p>}
        <ul className="space-y-2">
          {audits.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 text-sm">
              <span className="truncate text-fg">{a.company_name ?? `Vendor #${a.vendor_id}`}</span>
              <Badge tone="warn">{a.status}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Privacy requests */}
      <section className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-fg">
          <Trash2 size={17} className="text-arc" /> Privacy / removal requests ({removals.length})
        </h2>
        {removals.length === 0 && <p className="text-sm italic text-fg-muted">Queue is clear.</p>}
        <ul className="space-y-2">
          {removals.map((r) => (
            <li key={r.id} className="rounded-lg border border-line px-3.5 py-2.5 text-sm">
              <span className="font-mono text-[10px] uppercase text-warn">{r.kind}</span>{" "}
              <span className="text-fg">{r.email}</span>
              <p className="mt-0.5 text-xs text-fg-secondary">{r.details}</p>
              <p className="mt-0.5 font-mono text-[10px] text-fg-muted">30-day clock started {r.created_at?.slice(0, 10)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- Inline components ---------- */

function StatCard({
  label, value, icon: Icon, tone = "neutral",
}: {
  label: string; value: number; icon: typeof Database; tone?: "ok" | "arc" | "warn" | "neutral";
}) {
  const toneColors = {
    ok: "text-ok",
    arc: "text-arc",
    warn: "text-warn",
    neutral: "text-fg",
  };
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-fg-muted" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      </div>
      <span className={`font-display text-2xl font-bold ${toneColors[tone]}`}>
        {formatNumber(value)}
      </span>
    </div>
  );
}

function BarRow({
  label, count, total, tone = "neutral",
}: {
  label: string; count: number; total: number; tone?: "ok" | "arc" | "warn" | "danger" | "neutral";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors = {
    ok: "bg-ok/30",
    arc: "bg-arc/30",
    warn: "bg-warn/30",
    danger: "bg-danger/30",
    neutral: "bg-fg-muted/20",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-mono text-fg-muted">{formatNumber(count)} ({pct}%)</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Inline server-action form for approving an inspector. */
function ApproveInspector({ id }: { id: string }) {
  async function approve(): Promise<void> {
    "use server";
    const s = await getSession();
    if (!s || !can(s.role, "inspectors.manage")) return;
    ensurePlatformTables();
    db.prepare("UPDATE inspectors SET status = 'approved' WHERE id = ?").run(id);
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/admin");
    revalidatePath("/inspections");
  }
  return (
    <form action={approve}>
      <button
        type="submit"
        className="h-8 cursor-pointer rounded-[10px] border border-ok/40 bg-ok/10 px-3 text-xs font-medium text-ok transition-colors hover:bg-ok/20"
      >
        Approve listing
      </button>
    </form>
  );
}
