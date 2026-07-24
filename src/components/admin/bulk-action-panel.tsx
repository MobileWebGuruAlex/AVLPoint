"use client";

import { useState } from "react";
import { AlertTriangle, Zap, Trash2, Tag, Moon } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn, formatNumber } from "@/lib/utils";
import {
  bulkDisqualifyByFilterAction, bulkDeleteByFilterAction,
  bulkAddKeywordAction, bulkRemoveKeywordAction, bulkSleepByFilterAction,
} from "@/lib/admin-actions";
import type { FormState } from "@/lib/actions";

type BulkAction = "sleep" | "disqualify" | "delete" | "add_keyword" | "remove_keyword";

export function BulkActionPanel() {
  // Filter state
  const [tier, setTier] = useState("any");
  const [lifecycle, setLifecycle] = useState("any");
  const [completeness, setCompleteness] = useState("any");
  const [hasWebsite, setHasWebsite] = useState("any");
  const [hasEmail, setHasEmail] = useState("any");
  const [country, setCountry] = useState("");
  const [dataSource] = useState("");
  const [state, setState] = useState("any");

  // Preview state
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);

  // Action state
  const [action, setAction] = useState<BulkAction>("sleep");
  const [keywordField, setKeywordField] = useState("keywords");
  const [keywordValue, setKeywordValue] = useState("");
  const [sleepReason, setSleepReason] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handlePreview = async () => {
    setPreviewing(true);
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (tier !== "any") params.set("tier", tier);
      if (lifecycle !== "any") params.set("lifecycle", lifecycle);
      if (completeness !== "any") params.set("completeness", completeness);
      if (hasWebsite !== "any") params.set("hasWebsite", hasWebsite);
      if (hasEmail !== "any") params.set("hasEmail", hasEmail);
      if (country) params.set("country", country);
      if (dataSource) params.set("dataSource", dataSource);
      if (state !== "any") params.set("state", state);

      const resp = await fetch(`/api/admin/preview?${params.toString()}`);
      const data = await resp.json();
      setPreviewCount(data.count);
      setPreviewSample(data.sample ?? []);
    } catch {
      setPreviewCount(null);
      setPreviewSample([]);
    }
    setPreviewing(false);
  };

  const handleExecute = async () => {
    if (previewCount === null || previewCount === 0) return;
    if (action === "sleep" || action === "disqualify" || action === "delete") {
      if (String(confirmInput) !== String(previewCount)) return;
    }

    setExecuting(true);
    setResult(null);

    const formData = new FormData();
    if (tier !== "any") formData.set("tier", tier);
    if (lifecycle !== "any") formData.set("lifecycle", lifecycle);
    if (completeness !== "any") formData.set("completeness", completeness);
    if (hasWebsite !== "any") formData.set("hasWebsite", hasWebsite);
    if (hasEmail !== "any") formData.set("hasEmail", hasEmail);
    if (country) formData.set("country", country);
    if (dataSource) formData.set("dataSource", dataSource);
    if (state !== "any") formData.set("state", state);
    formData.set("expected_count", String(previewCount));
    formData.set("confirm_count", String(confirmInput));

    let res: FormState;
    if (action === "sleep") {
      formData.set("reason", sleepReason);
      res = await bulkSleepByFilterAction({}, formData);
    } else if (action === "disqualify") {
      res = await bulkDisqualifyByFilterAction({}, formData);
    } else if (action === "delete") {
      res = await bulkDeleteByFilterAction({}, formData);
    } else if (action === "add_keyword") {
      formData.set("field", keywordField);
      formData.set("value", keywordValue);
      res = await bulkAddKeywordAction({}, formData);
    } else {
      formData.set("field", keywordField);
      formData.set("value", keywordValue);
      res = await bulkRemoveKeywordAction({}, formData);
    }

    if (res.error) setResult({ type: "err", text: res.error });
    else setResult({ type: "ok", text: res.success ?? "Done." });

    setPreviewCount(null);
    setConfirmInput("");
    setExecuting(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Step 1: Filters */}
      <div className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-arc/10 text-[10px] font-bold text-arc">1</span>
          Define Filter
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tier" value={tier} onChange={setTier} options={[
            { value: "any", label: "Any tier" },
            { value: "0", label: "Tier 0 (unassessed)" },
            { value: "1", label: "Tier 1 (enterprise)" },
            { value: "2", label: "Tier 2 (regional)" },
            { value: "3", label: "Tier 3 (small)" },
          ]} />
          <Select label="Lifecycle" value={lifecycle} onChange={setLifecycle} options={[
            { value: "any", label: "Any stage" },
            { value: "discovered", label: "Discovered" },
            { value: "enriched", label: "Enriched" },
            { value: "fully_built", label: "Fully Built" },
            { value: "locked", label: "Locked" },
            { value: "disqualified", label: "Disqualified" },
          ]} />
          <Select label="Completeness" value={completeness} onChange={setCompleteness} options={[
            { value: "any", label: "Any" },
            { value: "verified", label: "Verified" },
            { value: "incomplete", label: "Incomplete" },
          ]} />
          <Select label="Has Website" value={hasWebsite} onChange={setHasWebsite} options={[
            { value: "any", label: "Any" },
            { value: "yes", label: "Has website" },
            { value: "no", label: "No website" },
          ]} />
          <Select label="Has Email" value={hasEmail} onChange={setHasEmail} options={[
            { value: "any", label: "Any" },
            { value: "yes", label: "Has email" },
            { value: "no", label: "No email" },
          ]} />
          <Select label="State" value={state} onChange={setState} options={[
            { value: "any", label: "Awake + sleeping" },
            { value: "awake", label: "Awake only" },
            { value: "sleeping", label: "Sleeping only" },
          ]} />
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-fg-muted">Country</label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United States" className="h-8 text-xs" />
          </div>
        </div>
        <Button variant="secondary" size="sm" className="mt-4" onClick={handlePreview} disabled={previewing}>
          {previewing ? "Counting..." : "Preview Match"}
        </Button>
      </div>

      {/* Step 2: Preview */}
      {previewCount !== null && (
        <div className="card border-warn/30 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warn/10 text-[10px] font-bold text-warn">2</span>
            Preview
          </h2>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warn" />
            <span className="text-sm font-medium text-warn">
              {formatNumber(previewCount)} vendors match this filter
            </span>
          </div>
          {previewSample.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase text-fg-muted">Sample:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {previewSample.map((name) => (
                  <span key={name} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-fg-secondary">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Action */}
      {previewCount !== null && previewCount > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-fg">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-arc/10 text-[10px] font-bold text-arc">3</span>
            Choose Action
          </h2>

          <div className="space-y-2">
            <ActionRadio
              label="Sleep all (hide from users — reversible, recommended)"
              icon={<Moon size={14} className="text-arc" />}
              selected={action === "sleep"}
              onClick={() => setAction("sleep")}
            />
            <ActionRadio
              label="Disqualify all (pipeline soft-reject)"
              icon={<Zap size={14} className="text-warn" />}
              selected={action === "disqualify"}
              onClick={() => setAction("disqualify")}
            />
            <ActionRadio
              label="Permanently delete all (irreversible — super admin only)"
              icon={<Trash2 size={14} className="text-danger" />}
              selected={action === "delete"}
              onClick={() => setAction("delete")}
            />
            <ActionRadio
              label="Add keyword to all"
              icon={<Tag size={14} className="text-ok" />}
              selected={action === "add_keyword"}
              onClick={() => setAction("add_keyword")}
            />
            <ActionRadio
              label="Remove keyword from all"
              icon={<Tag size={14} className="text-fg-muted" />}
              selected={action === "remove_keyword"}
              onClick={() => setAction("remove_keyword")}
            />
          </div>

          {/* Keyword options */}
          {(action === "add_keyword" || action === "remove_keyword") && (
            <div className="mt-4 flex gap-2">
              <select
                value={keywordField}
                onChange={(e) => setKeywordField(e.target.value)}
                className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg focus:border-arc/60 focus:outline-none"
              >
                <option value="keywords">keywords</option>
                <option value="search_tags">search_tags</option>
                <option value="vendor_categories">vendor_categories</option>
                <option value="use_cases">use_cases</option>
                <option value="project_types">project_types</option>
                <option value="technical_specialties">technical_specialties</option>
                <option value="sub_industries">sub_industries</option>
                <option value="industries_served">industries_served</option>
              </select>
              <Input
                value={keywordValue}
                onChange={(e) => setKeywordValue(e.target.value)}
                placeholder="Keyword value"
                className="h-8 max-w-[200px] text-xs"
              />
            </div>
          )}

          {/* Sleep reason */}
          {action === "sleep" && (
            <div className="mt-4">
              <label className="mb-1 block text-[10px] font-medium uppercase text-fg-muted">Reason (kept in audit log)</label>
              <Input
                value={sleepReason}
                onChange={(e) => setSleepReason(e.target.value)}
                placeholder="e.g. duplicate source data, quality review"
                className="h-8 max-w-[320px] text-xs"
              />
            </div>
          )}

          {/* Confirm */}
          <div className="mt-6 space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
            {(action === "sleep" || action === "disqualify" || action === "delete") ? (
              <>
                <p className="text-xs text-danger">
                  Type <code className="rounded bg-danger/10 px-1 font-mono">{previewCount}</code> to confirm.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={`Type ${previewCount}`}
                    className="h-8 max-w-[160px] border-danger/40 text-xs"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={String(confirmInput) !== String(previewCount) || executing}
                    onClick={handleExecute}
                  >
                    {executing ? "Executing..." : "Execute"}
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!keywordValue.trim() || executing}
                onClick={handleExecute}
              >
                {executing ? "Executing..." : `${action === "add_keyword" ? "Add" : "Remove"} keyword`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          result.type === "ok" ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/10 text-danger"
        )}>
          {result.text}
        </div>
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase text-fg-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg focus:border-arc/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ActionRadio({ label, icon, selected, onClick }: {
  label: string; icon: React.ReactNode; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
        selected ? "border-arc/60 bg-arc/5 text-fg" : "border-line text-fg-secondary hover:border-arc/30"
      )}
    >
      <span className={cn(
        "flex h-4 w-4 items-center justify-center rounded-full border-2",
        selected ? "border-arc bg-arc" : "border-line"
      )}>
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {icon}
      {label}
    </button>
  );
}
