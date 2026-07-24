"use client";

import { useActionState, useState } from "react";
import { Upload, Loader2, FileText, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { commitIngestAction } from "@/lib/platform-actions";
import type { FormState } from "@/lib/actions";
import type { ExtractedVendor } from "@/lib/ai-extract";
import { Button } from "./ui";

/**
 * Phase 3 — Photo-to-AVL. Upload any legacy AVL (CSV, PDF, scan, photo),
 * Claude parses it, the human reviews/edits rows, then commits to the
 * org's private database. AI extracts; a person approves.
 */
export function IngestUploader() {
  const [phase, setPhase] = useState<"idle" | "uploading" | "review">("idle");
  const [rows, setRows] = useState<ExtractedVendor[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [commitState, commitAction, committing] = useActionState<FormState, FormData>(commitIngestAction, {});

  async function onFile(file: File | null) {
    if (!file) return;
    setError("");
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Extraction failed.");
        setPhase("idle");
        return;
      }
      setRows(data.vendors);
      setSource(data.source);
      setPhase("review");
    } catch {
      setError("Upload failed — try again.");
      setPhase("idle");
    }
  }

  function edit(i: number, field: keyof ExtractedVendor, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  if (commitState.success) {
    return (
      <div className="anim-fade-up flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-ok/40 bg-ok/10 text-ok">
          <CheckCircle2 size={24} />
        </div>
        <p className="text-sm text-fg-secondary">{commitState.success}</p>
        <Button variant="secondary" size="sm" onClick={() => { setPhase("idle"); setRows([]); window.location.reload(); }}>
          Ingest another file
        </Button>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-fg">
            <FileText size={15} className="text-arc" />
            <span className="font-mono text-xs">{source}</span> — {rows.length} vendors extracted
          </p>
          <p className="font-mono text-[11px] text-fg-muted">review · edit · approve</p>
        </div>
        <div className="max-h-96 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              <tr>
                {["Company", "Capabilities", "Certs", "Location", "Conf.", ""].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {(["name", "capabilities", "certifications", "location"] as const).map((f) => (
                    <td key={f} className="px-1 py-1">
                      <input
                        value={r[f] ?? ""}
                        onChange={(e) => edit(i, f, e.target.value)}
                        className="w-full min-w-24 rounded border border-transparent bg-transparent px-2 py-1 text-xs text-fg focus:border-arc/50 focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className={`px-3 py-1 font-mono ${(r.confidence ?? 0) < 0.6 ? "text-warn" : "text-fg-muted"}`}>
                    {Math.round((r.confidence ?? 0.5) * 100)}%
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setRows((rows) => rows.filter((_, idx) => idx !== i))}
                      className="cursor-pointer text-fg-muted transition-colors hover:text-danger"
                      aria-label="Remove row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={commitAction} className="flex items-center gap-3">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <input type="hidden" name="source" value={source} />
          <Button type="submit" disabled={committing || rows.length === 0}>
            {committing && <Loader2 size={14} className="animate-spin" />}
            Approve {rows.length} vendors → private AVL
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setPhase("idle"); setRows([]); }}>
            Cancel
          </Button>
        </form>
        {commitState.error && (
          <p className="flex items-start gap-2 text-xs text-danger"><AlertCircle size={13} className="mt-0.5" />{commitState.error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          phase === "uploading" ? "border-arc/50 bg-arc/5" : "border-line-strong hover:border-arc/40"
        }`}
      >
        <input
          type="file"
          className="sr-only"
          accept=".csv,.tsv,.txt,.pdf,image/*"
          disabled={phase === "uploading"}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {phase === "uploading" ? (
          <>
            <Loader2 size={26} className="animate-spin text-arc" />
            <p className="text-sm text-fg-secondary">Claude is reading your document…</p>
            <p className="font-mono text-[11px] text-fg-muted">extracting vendors · scoring confidence</p>
          </>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
              <Upload size={22} />
            </span>
            <p className="text-sm font-medium text-fg">Drop in your legacy AVL — any form</p>
            <p className="max-w-sm text-xs leading-relaxed text-fg-secondary">
              Spreadsheet (CSV), PDF export, scan — even a photo of a printed list from 1998.
              AI parses it; you review every row before it&apos;s saved.
            </p>
            <p className="font-mono text-[10px] text-fg-muted">.csv · .pdf · .png · .jpg — 8MB max · Excel? save as CSV</p>
          </>
        )}
      </label>
      {error && (
        <p className="mt-3 flex items-start gap-2 text-xs text-danger"><AlertCircle size={13} className="mt-0.5" />{error}</p>
      )}
    </div>
  );
}
