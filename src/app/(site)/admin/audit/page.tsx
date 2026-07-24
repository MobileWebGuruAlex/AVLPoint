import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { queryAudit, auditActionTypes } from "@/lib/audit";
import { Badge, Input, Label, Select } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Log — Admin" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ENTITY_TYPES = ["vendor", "user", "org", "inspector", "inspection", "invitation", "session", "system"];

function tone(action: string): "ok" | "warn" | "arc" | "neutral" {
  if (/approve|wake|enable|accepted|login$/.test(action)) return "ok";
  if (/delete|reject|sleep|disable|fail|revoke|suspend|lockout/.test(action)) return "warn";
  if (/edit|create|invite|change|add/.test(action)) return "arc";
  return "neutral";
}

function detailsPreview(raw: string): string {
  try {
    const d = JSON.parse(raw || "{}");
    if (d.fields) return Object.keys(d.fields).join(", ");
    if (d.from && d.to) return `${d.from} → ${d.to}`;
    if (d.reason) return `“${d.reason}”`;
    if (d.vendor_count) return `${d.vendor_count} vendors`;
    if (d.count) return `${d.count} affected`;
    if (d.field && d.value) return `${d.field}: "${d.value}"`;
    if (d.affected) return `${d.affected} affected`;
    if (d.role) return `role: ${d.role}`;
    if (d.label) return String(d.label);
    if (d.ip) return String(d.ip);
  } catch { /* */ }
  return "";
}

export default async function AdminAuditPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;
  const filters = {
    page,
    pageSize: 50,
    actionType: typeof sp.actionType === "string" && sp.actionType !== "any" ? sp.actionType : undefined,
    entityType: typeof sp.entityType === "string" && sp.entityType !== "any" ? sp.entityType : undefined,
    actorEmail: typeof sp.actor === "string" ? sp.actor : undefined,
    entityId: typeof sp.entityId === "string" ? sp.entityId : undefined,
  };
  const { rows, total } = queryAudit(filters);
  const actionTypes = auditActionTypes();
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Accountability</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">Audit Log</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatNumber(total)} events · every admin mutation, auth event, and lifecycle change lands here
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-44">
          <Label htmlFor="entityType">Entity</Label>
          <Select id="entityType" name="entityType" defaultValue={filters.entityType ?? "any"}>
            <option value="any">Any entity</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="w-56">
          <Label htmlFor="actionType">Action</Label>
          <Select id="actionType" name="actionType" defaultValue={filters.actionType ?? "any"}>
            <option value="any">Any action</option>
            {actionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <Label htmlFor="actor">Actor</Label>
          <Input id="actor" name="actor" placeholder="email contains…" defaultValue={filters.actorEmail ?? ""} />
        </div>
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-[10px] border border-line-strong bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:border-arc/50"
        >
          Filter
        </button>
        {(filters.entityType || filters.actionType || filters.actorEmail || filters.entityId) && (
          <Link href="/admin/audit" className="pb-2.5 text-xs text-arc hover:underline">Clear</Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-175 text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">When</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">Actor</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">Action</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">Entity</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">Target</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm italic text-fg-muted">
                  No events match these filters.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              let label = a.target_vendor_name ?? "";
              if (!label) label = detailsLabel(a.details) ?? a.entity_id ?? "";
              const href =
                a.entity_type === "vendor" && a.target_vendor_id ? `/admin/vendors/${a.target_vendor_id}` :
                a.entity_type === "user" && a.entity_id ? `/admin/users/${a.entity_id}` : null;
              return (
                <tr key={a.id} className="transition-colors hover:bg-surface-2">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg-muted">
                    {a.created_at?.slice(0, 16)}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs text-fg-secondary">{a.admin_email}</td>
                  <td className="px-3 py-2">
                    <Badge tone={tone(a.action_type)}>{a.action_type}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] uppercase text-fg-muted">{a.entity_type}</td>
                  <td className="max-w-[200px] px-3 py-2 text-xs">
                    {label ? (
                      href ? (
                        <Link href={href} className="truncate text-fg-secondary hover:text-arc">{label}</Link>
                      ) : (
                        <span className="truncate text-fg-secondary">{label}</span>
                      )
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="max-w-[250px] truncate px-3 py-2 font-mono text-[10px] text-fg-muted">
                    {detailsPreview(a.details) || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-xs text-fg-muted">Page {page} of {formatNumber(totalPages)}</p>
        <div className="flex items-center gap-1">
          {page > 1 && (
            <Link
              href={buildPageHref(sp, page - 1)}
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft size={14} />
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={buildPageHref(sp, page + 1)}
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function detailsLabel(raw: string): string | null {
  try {
    const d = JSON.parse(raw || "{}");
    return typeof d.label === "string" ? d.label : null;
  } catch {
    return null;
  }
}

function buildPageHref(sp: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const key of ["entityType", "actionType", "actor", "entityId"]) {
    const v = sp[key];
    if (typeof v === "string" && v && v !== "any") params.set(key, v);
  }
  params.set("page", String(page));
  return `/admin/audit?${params.toString()}`;
}
