"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  Search, ChevronLeft, ChevronRight, Pencil,
  CheckCircle2, XCircle, Moon, Sun,
} from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { cn, formatNumber, vendorLocation } from "@/lib/utils";
import type { AdminFilters, VendorFullRow } from "@/lib/admin";
import {
  quickLifecycleAction, bulkApproveAction, bulkRejectAction,
  sleepVendorAction, wakeVendorAction, bulkSleepAction, bulkWakeAction,
} from "@/lib/admin-actions";
import type { FormState } from "@/lib/actions";

interface Props {
  vendors: VendorFullRow[];
  total: number;
  page: number;
  pageSize: number;
  currentFilters: AdminFilters;
}

export function VendorTable({ vendors, total, page, pageSize, currentFilters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchInput, setSearchInput] = useState(currentFilters.q ?? "");

  const totalPages = Math.ceil(total / pageSize);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === "" || v === "any") {
          params.delete(k);
        } else {
          params.set(k, v);
        }
      }
      // Reset to page 1 when filters change (unless changing page itself)
      if (!("page" in updates)) params.delete("page");
      startTransition(() => router.push(`/admin/vendors?${params.toString()}`));
    },
    [router, searchParams, startTransition]
  );

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === vendors.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(vendors.map((v) => v.id)));
    }
  };

  const handleBulkAction = async (action: "approve" | "reject" | "sleep" | "wake") => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const formData = new FormData();
    formData.set("vendor_ids", JSON.stringify(ids));
    if (action === "sleep") formData.set("reason", "bulk sleep from vendor table");
    const fn =
      action === "approve" ? bulkApproveAction :
      action === "reject" ? bulkRejectAction :
      action === "sleep" ? bulkSleepAction : bulkWakeAction;
    await fn({} as FormState, formData);
    setSelected(new Set());
    router.refresh();
  };

  const tierBadge = (tier: number) => {
    const tones: Record<number, "ok" | "arc" | "warn" | "neutral"> = { 1: "ok", 2: "arc", 3: "warn" };
    return <Badge tone={tones[tier] ?? "neutral"}>T{tier}</Badge>;
  };

  const lifecycleBadge = (stage: string | null) => {
    const s = stage ?? "discovered";
    const tones: Record<string, "ok" | "arc" | "warn" | "neutral"> = {
      locked: "ok", fully_built: "arc", enriched: "arc", discovered: "neutral", disqualified: "warn",
    };
    return <Badge tone={tones[s] ?? "neutral"}>{s}</Badge>;
  };

  return (
    <div className={cn("space-y-4", isPending && "opacity-60 pointer-events-none")}>
      {/* Search + Filters */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q: searchInput || undefined });
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${formatNumber(total)} vendors...`}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" size="md">Search</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Tier"
            value={currentFilters.tier?.toString() ?? "any"}
            options={[
              { value: "any", label: "Any tier" },
              { value: "1", label: "Tier 1 (enterprise)" },
              { value: "2", label: "Tier 2 (regional)" },
              { value: "3", label: "Tier 3 (small)" },
              { value: "0", label: "Tier 0 (unassessed)" },
            ]}
            onChange={(v) => updateParams({ tier: v })}
          />
          <FilterSelect
            label="Lifecycle"
            value={currentFilters.lifecycle ?? "any"}
            options={[
              { value: "any", label: "Any stage" },
              { value: "discovered", label: "Discovered" },
              { value: "enriched", label: "Enriched" },
              { value: "fully_built", label: "Fully Built" },
              { value: "locked", label: "Locked (approved)" },
              { value: "disqualified", label: "Disqualified" },
            ]}
            onChange={(v) => updateParams({ lifecycle: v })}
          />
          <FilterSelect
            label="Completeness"
            value={currentFilters.completeness ?? "any"}
            options={[
              { value: "any", label: "Any status" },
              { value: "verified", label: "Verified" },
              { value: "incomplete", label: "Incomplete" },
            ]}
            onChange={(v) => updateParams({ completeness: v })}
          />
          <FilterSelect
            label="Website"
            value={currentFilters.hasWebsite === true ? "yes" : currentFilters.hasWebsite === false ? "no" : "any"}
            options={[
              { value: "any", label: "Any" },
              { value: "yes", label: "Has website" },
              { value: "no", label: "No website" },
            ]}
            onChange={(v) => updateParams({ hasWebsite: v })}
          />
          <FilterSelect
            label="Email"
            value={currentFilters.hasEmail === true ? "yes" : currentFilters.hasEmail === false ? "no" : "any"}
            options={[
              { value: "any", label: "Any" },
              { value: "yes", label: "Has email" },
              { value: "no", label: "No email" },
            ]}
            onChange={(v) => updateParams({ hasEmail: v })}
          />
          <FilterSelect
            label="State"
            value={currentFilters.sleepState ?? "any"}
            options={[
              { value: "any", label: "Awake + sleeping" },
              { value: "awake", label: "Awake only" },
              { value: "sleeping", label: "Sleeping only" },
            ]}
            onChange={(v) => updateParams({ state: v })}
          />
          <FilterSelect
            label="Sort"
            value={currentFilters.sort ?? "updated"}
            options={[
              { value: "updated", label: "Last updated" },
              { value: "name", label: "Name" },
              { value: "tier", label: "Tier" },
              { value: "score", label: "Score" },
              { value: "priority", label: "Priority" },
            ]}
            onChange={(v) => updateParams({ sort: v })}
          />
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-arc/30 bg-arc/5 px-4 py-2.5">
          <span className="text-sm font-medium text-arc">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => handleBulkAction("approve")}>
            <CheckCircle2 size={14} /> Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleBulkAction("reject")}>
            <XCircle size={14} /> Reject
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleBulkAction("sleep")}>
            <Moon size={14} /> Sleep
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleBulkAction("wake")}>
            <Sun size={14} /> Wake
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.size === vendors.length && vendors.length > 0}
                  onChange={toggleAll}
                  className="accent-arc"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Company
              </th>
              <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Location
              </th>
              <th className="px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Tier
              </th>
              <th className="px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Stage
              </th>
              <th className="px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Score
              </th>
              <th className="px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Status
              </th>
              <th className="px-3 py-2.5 text-right font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {vendors.map((v) => (
              <tr
                key={v.id}
                className={cn(
                  "transition-colors hover:bg-surface-2",
                  selected.has(v.id) && "bg-arc/5",
                  v.enterprise_tier === 1 && "border-l-2 border-l-ok/40",
                  v.enterprise_tier === 3 && "border-l-2 border-l-fg-muted/20",
                )}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    className="accent-arc"
                  />
                </td>
                <td className="max-w-[280px] px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {Boolean(v.sleeping) && (
                      <Moon size={12} className="shrink-0 text-warn" aria-label="Sleeping" />
                    )}
                    <Link
                      href={`/admin/vendors/${v.id}`}
                      className={cn(
                        "block truncate font-display text-sm font-semibold hover:text-arc",
                        v.sleeping ? "text-fg-muted line-through decoration-warn/40" : "text-fg"
                      )}
                    >
                      {v.company_name}
                    </Link>
                  </div>
                  {v.website_url && (
                    <p className="truncate font-mono text-[10px] text-fg-muted">{v.website_url}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-fg-secondary">
                  {vendorLocation(v) !== "Location on file" ? vendorLocation(v) : "—"}
                </td>
                <td className="px-3 py-2 text-center">{tierBadge(v.enterprise_tier)}</td>
                <td className="px-3 py-2 text-center">{lifecycleBadge(v.lifecycle_stage)}</td>
                <td className="px-3 py-2 text-center font-mono text-xs text-fg-secondary">
                  {v.enterprise_suitability_score ?? 0}
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge tone={v.completeness_status === "verified" ? "ok" : "neutral"}>
                    {v.completeness_status ?? "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/vendors/${v.id}`}
                      className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-arc"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </Link>
                    <QuickAction vendorId={v.id} stage="locked" icon="approve" />
                    <QuickAction vendorId={v.id} stage="disqualified" icon="reject" />
                    <SleepWakeButton vendorId={v.id} sleeping={Boolean(v.sleeping)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-fg-muted">
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
          {formatNumber(total)} vendors
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="px-3 font-mono text-xs text-fg-secondary">
            Page {page} of {formatNumber(totalPages)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helper components ---------- */

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg-secondary transition-colors focus:border-arc/60 focus:outline-none"
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function QuickAction({
  vendorId,
  stage,
  icon,
}: {
  vendorId: number;
  stage: string;
  icon: "approve" | "reject";
}) {
  const router = useRouter();
  const handleClick = async () => {
    const formData = new FormData();
    formData.set("vendor_id", String(vendorId));
    formData.set("stage", stage);
    await quickLifecycleAction({} as FormState, formData);
    router.refresh();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "rounded-lg p-1.5 transition-colors",
        icon === "approve"
          ? "text-fg-muted hover:bg-ok/10 hover:text-ok"
          : "text-fg-muted hover:bg-danger/10 hover:text-danger"
      )}
      title={icon === "approve" ? "Approve (lock)" : "Reject (disqualify)"}
      aria-label={icon === "approve" ? "Approve (lock)" : "Reject (disqualify)"}
    >
      {icon === "approve" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
    </button>
  );
}

/** One-click reversible hide/show. Sleeping ⇒ Sun (wake); awake ⇒ Moon (sleep). */
function SleepWakeButton({ vendorId, sleeping }: { vendorId: number; sleeping: boolean }) {
  const router = useRouter();
  const handleClick = async () => {
    const formData = new FormData();
    formData.set("vendor_id", String(vendorId));
    if (!sleeping) formData.set("reason", "quick sleep from vendor table");
    await (sleeping ? wakeVendorAction : sleepVendorAction)({} as FormState, formData);
    router.refresh();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "rounded-lg p-1.5 transition-colors",
        sleeping
          ? "text-warn hover:bg-ok/10 hover:text-ok"
          : "text-fg-muted hover:bg-warn/10 hover:text-warn"
      )}
      title={sleeping ? "Wake (restore everywhere)" : "Sleep (hide from users, reversible)"}
      aria-label={sleeping ? "Wake vendor" : "Sleep vendor"}
    >
      {sleeping ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
