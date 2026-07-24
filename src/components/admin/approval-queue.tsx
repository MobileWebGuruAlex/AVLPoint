"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2, XCircle, SkipForward, Pencil,
  ChevronLeft, ChevronRight, Globe, Mail, Phone,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn, formatNumber, vendorLocation, jsonList, truncate } from "@/lib/utils";
import type { VendorFullRow } from "@/lib/admin";
import { quickLifecycleAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/actions";

interface Props {
  vendors: VendorFullRow[];
  total: number;
  page: number;
  pageSize: number;
  currentTier?: number;
}

export function ApprovalQueue({ vendors, total, page, pageSize, currentTier }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const totalPages = Math.ceil(total / pageSize);

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "any") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`/admin/approval?${params.toString()}`));
  };

  const handleAction = async (vendorId: number, stage: string) => {
    const formData = new FormData();
    formData.set("vendor_id", String(vendorId));
    formData.set("stage", stage);
    await quickLifecycleAction({} as FormState, formData);
    setDismissed((prev) => new Set([...prev, vendorId]));
  };

  const visibleVendors = vendors.filter((v) => !dismissed.has(v.id));

  return (
    <div className={cn("space-y-4", isPending && "opacity-60 pointer-events-none")}>
      {/* Tier filter */}
      <div className="flex gap-2">
        {[
          { value: undefined, label: "All tiers" },
          { value: 1, label: "Tier 1 (enterprise)" },
          { value: 2, label: "Tier 2 (regional)" },
          { value: 3, label: "Tier 3 (small)" },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => navigate({ tier: t.value?.toString(), page: undefined })}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              currentTier === t.value
                ? "border-arc/60 bg-arc/10 text-arc"
                : "border-line text-fg-secondary hover:border-arc/30"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vendor cards */}
      {visibleVendors.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-fg-muted">
            {dismissed.size > 0
              ? "All vendors on this page reviewed. Load the next page."
              : "No vendors pending review for this filter."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visibleVendors.map((v) => (
          <div key={v.id} className={cn(
            "card overflow-hidden transition-all duration-300",
            v.enterprise_tier === 1 && "border-l-2 border-l-ok/60",
            v.enterprise_tier === 3 && "border-l-2 border-l-warn/40",
          )}>
            <div className="p-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-base font-semibold text-fg">
                      {v.company_name}
                    </h3>
                    <Badge tone={v.enterprise_tier === 1 ? "ok" : v.enterprise_tier === 2 ? "arc" : "warn"}>
                      Tier {v.enterprise_tier}
                    </Badge>
                    <span className="font-mono text-[10px] text-fg-muted">
                      Score: {v.enterprise_suitability_score ?? 0}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-secondary">
                    {vendorLocation(v)} · {v.primary_business_type ?? "Unknown type"}
                  </p>
                </div>
              </div>

              {/* Description */}
              {(v.ai_summary || v.company_description) && (
                <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                  {truncate(v.ai_summary || v.company_description || "", 300)}
                </p>
              )}

              {/* Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {jsonList(v.keywords).slice(0, 6).map((kw) => (
                  <span key={kw} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">
                    {kw}
                  </span>
                ))}
                {jsonList(v.certifications_held).slice(0, 4).map((c) => (
                  <span key={c} className="rounded-md border border-ok/30 bg-ok/5 px-2 py-0.5 text-[10px] text-ok">
                    {c}
                  </span>
                ))}
              </div>

              {/* Contact signals */}
              <div className="mt-3 flex items-center gap-4 text-[10px] text-fg-muted">
                {v.website_url && (
                  <span className="flex items-center gap-1">
                    <Globe size={10} /> {v.website_url.replace(/https?:\/\/(www\.)?/, "").slice(0, 30)}
                  </span>
                )}
                {v.contact_email && (
                  <span className="flex items-center gap-1"><Mail size={10} /> Email on file</span>
                )}
                {v.contact_phone && (
                  <span className="flex items-center gap-1"><Phone size={10} /> Phone on file</span>
                )}
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between border-t border-line bg-surface-2/50 px-5 py-3">
              <Link
                href={`/admin/vendors/${v.id}`}
                className="flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-arc"
              >
                <Pencil size={12} /> Edit details
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissed((prev) => new Set([...prev, v.id]))}
                >
                  <SkipForward size={14} /> Skip
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleAction(v.id, "disqualified")}
                >
                  <XCircle size={14} /> Reject
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleAction(v.id, "locked")}
                >
                  <CheckCircle2 size={14} /> Approve
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-fg-muted">
          Page {page} of {formatNumber(totalPages)} · {formatNumber(total)} vendors pending
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            disabled={page <= 1}
            onClick={() => navigate({ page: String(page - 1) })}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            variant="ghost" size="sm"
            disabled={page >= totalPages}
            onClick={() => navigate({ page: String(page + 1) })}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
