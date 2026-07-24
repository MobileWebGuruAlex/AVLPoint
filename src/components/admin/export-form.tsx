"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Input } from "@/components/ui";

export function ExportForm() {
  const [tier, setTier] = useState("any");
  const [lifecycle, setLifecycle] = useState("any");
  const [completeness, setCompleteness] = useState("any");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("format", format);
    if (tier !== "any") params.set("tier", tier);
    if (lifecycle !== "any") params.set("lifecycle", lifecycle);
    if (completeness !== "any") params.set("completeness", completeness);

    try {
      const resp = await fetch(`/api/admin/export?${params.toString()}`);
      if (!resp.ok) throw new Error("Export failed");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avlpoint_vendors_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Check console for details.");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="card p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-fg">Export Options</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-fg-muted">Format</label>
            <div className="flex gap-2">
              {(["csv", "json"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                    format === f
                      ? "border-arc/60 bg-arc/10 text-arc"
                      : "border-line text-fg-secondary hover:border-arc/30"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <Select label="Tier" value={tier} onChange={setTier} options={[
            { value: "any", label: "All tiers" },
            { value: "1", label: "Tier 1" },
            { value: "2", label: "Tier 2" },
            { value: "3", label: "Tier 3" },
          ]} />

          <Select label="Lifecycle" value={lifecycle} onChange={setLifecycle} options={[
            { value: "any", label: "All stages" },
            { value: "locked", label: "Approved (locked)" },
            { value: "enriched", label: "Enriched" },
            { value: "fully_built", label: "Fully Built" },
            { value: "disqualified", label: "Disqualified" },
            { value: "discovered", label: "Discovered" },
          ]} />

          <Select label="Completeness" value={completeness} onChange={setCompleteness} options={[
            { value: "any", label: "Any" },
            { value: "verified", label: "Verified" },
            { value: "incomplete", label: "Incomplete" },
          ]} />

          <Button
            variant="primary"
            size="md"
            onClick={handleExport}
            disabled={loading}
            className="mt-4"
          >
            <Download size={15} />
            {loading ? "Exporting..." : `Export as ${format.toUpperCase()}`}
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-display text-sm font-semibold text-fg">Quick Exports</h2>
        <div className="space-y-2">
          <QuickButton label="All approved vendors (CSV)" format="csv" lifecycle="locked" />
          <QuickButton label="All approved vendors (JSON)" format="json" lifecycle="locked" />
          <QuickButton label="All disqualified vendors (CSV)" format="csv" lifecycle="disqualified" />
          <QuickButton label="All Tier 1 vendors (CSV)" format="csv" tier="1" />
        </div>
      </div>
    </div>
  );
}

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

function QuickButton({
  label, format, lifecycle, tier,
}: {
  label: string; format: string; lifecycle?: string; tier?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("format", format);
    if (lifecycle) params.set("lifecycle", lifecycle);
    if (tier) params.set("tier", tier);

    try {
      const resp = await fetch(`/api/admin/export?${params.toString()}`);
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avlpoint_${lifecycle || "tier" + tier}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Export failed.");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-fg-secondary transition-colors hover:border-arc/40 hover:text-arc disabled:opacity-50"
    >
      <Download size={12} /> {loading ? "Downloading..." : label}
    </button>
  );
}
