"use client";

import { useState, useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Palette, Plus, Trash2 } from "lucide-react";
import { updateVendorProfileAction } from "@/lib/platform-actions";
import type { FormState } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "classic", name: "Classic", blurb: "Clean directory look — subtle accent." },
  { id: "bold", name: "Bold", blurb: "Full-width banner, strong brand color." },
  { id: "blueprint", name: "Blueprint", blurb: "Technical grid, mono details." },
];

export interface VendorProfileValues {
  template: string;
  accent: string;
  tagline: string;
  about: string;
  bannerImage: string | null;
  gallery: string[];
  highlights: { label: string; value: string }[];
}

export function VendorProfileEditor({
  vendorId,
  initial,
}: {
  vendorId: number;
  initial: VendorProfileValues;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateVendorProfileAction,
    {}
  );
  const [template, setTemplate] = useState(initial.template);
  const [accent, setAccent] = useState(initial.accent || "#38bdf8");
  const [banner, setBanner] = useState<string | null>(initial.bannerImage);
  const [gallery, setGallery] = useState<string[]>(initial.gallery);
  const [highlights, setHighlights] = useState(initial.highlights);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="vendor_id" value={vendorId} />
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="accent" value={accent} />
      <input type="hidden" name="banner_image" value={banner ?? ""} />
      <input type="hidden" name="gallery" value={JSON.stringify(gallery)} />
      <input type="hidden" name="highlights" value={JSON.stringify(highlights)} />

      {/* Template picker */}
      <div>
        <Label>Page template</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                template === t.id
                  ? "border-arc bg-arc/5"
                  : "border-line hover:border-arc/40"
              )}
            >
              <p className={cn("text-sm font-semibold", template === t.id ? "text-arc" : "text-fg")}>
                {t.name}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">{t.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="flex items-end gap-3">
        <div>
          <Label htmlFor="pf-accent">Brand color</Label>
          <div className="flex items-center gap-2">
            <input
              id="pf-accent"
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2 p-1"
            />
            <span className="font-mono text-xs text-fg-muted">{accent}</span>
          </div>
        </div>
        <p className="flex items-center gap-1.5 pb-2 text-xs text-fg-muted">
          <Palette size={13} /> Used for your banner, badges, and card border.
        </p>
      </div>

      <div>
        <Label htmlFor="pf-tagline">Tagline</Label>
        <Input
          id="pf-tagline" name="tagline" defaultValue={initial.tagline} maxLength={140}
          placeholder="e.g. ASME-stamped vessels, built on time since 1987"
        />
      </div>

      <div>
        <Label htmlFor="pf-about">About your company</Label>
        <Textarea
          id="pf-about" name="about" rows={5} defaultValue={initial.about} maxLength={4000}
          placeholder="Your story, capabilities, and what makes your shop different — in your own words."
        />
      </div>

      <ImageUpload
        scope="vendor" targetId={vendorId} value={banner} onChange={setBanner}
        label="Banner image (wide, e.g. shop floor)"
      />

      {/* Gallery */}
      <div>
        <Label>Photo gallery (up to 8)</Label>
        <div className="flex flex-wrap gap-3">
          {gallery.map((url, i) => (
            <ImageUpload
              key={url} scope="vendor" targetId={vendorId} value={url} aspect="square" label=""
              onChange={(u) => setGallery((g) => (u ? g.map((x, j) => (j === i ? u : x)) : g.filter((_, j) => j !== i)))}
            />
          ))}
          {gallery.length < 8 && (
            <ImageUpload
              scope="vendor" targetId={vendorId} value={null} aspect="square" label=""
              onChange={(u) => u && setGallery((g) => [...g, u])}
            />
          )}
        </div>
      </div>

      {/* Highlights */}
      <div>
        <Label>Highlights (label + value, shown as stat cards)</Label>
        <div className="space-y-2">
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={h.label} maxLength={40} placeholder="Label — e.g. On-time delivery"
                onChange={(e) => setHighlights((hs) => hs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="h-9 text-xs"
              />
              <Input
                value={h.value} maxLength={80} placeholder="Value — e.g. 98.4%"
                onChange={(e) => setHighlights((hs) => hs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                className="h-9 text-xs"
              />
              <button
                type="button"
                onClick={() => setHighlights((hs) => hs.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg p-2 text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                aria-label="Remove highlight"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {highlights.length < 6 && (
            <button
              type="button"
              onClick={() => setHighlights((hs) => [...hs, { label: "", value: "" }])}
              className="flex items-center gap-1.5 text-xs text-arc hover:underline"
            >
              <Plus size={13} /> Add highlight
            </button>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        Publish profile
      </Button>
      {state.error && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {state.success}
        </p>
      )}
    </form>
  );
}
