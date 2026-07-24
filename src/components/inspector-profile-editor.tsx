"use client";

import { useActionState, useState, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { updateInspectorProfileAction } from "@/lib/user-actions";
import type { FormState } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "field", name: "Field", blurb: "Rugged — big photo, high-vis accent." },
  { id: "precision", name: "Precision", blurb: "Clean lab look, restrained." },
  { id: "ledger", name: "Ledger", blurb: "Document style, mono, credential-forward." },
];

export interface InspectorProfileValues {
  template: string;
  accent: string;
  tagline: string;
  bio: string;
  photoImage: string | null;
  bannerImage: string | null;
  gallery: string[];
  certifications: string[];
  serviceRegions: string[];
  specialties: string[];
  pricingNote: string;
  yearsExperience: string;
}

/** Enter-to-add chip input backed by a string[]. */
function TagInput({
  label, values, onChange, placeholder,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v) && values.length < 12) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-line bg-surface-2 p-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-md border border-arc/25 bg-arc/10 px-2 py-0.5 text-xs text-arc">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : "Add…"}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
    </div>
  );
}

export function InspectorProfileEditor({
  inspectorId,
  initial,
}: {
  inspectorId: string;
  initial: InspectorProfileValues;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateInspectorProfileAction,
    {}
  );
  const [template, setTemplate] = useState(initial.template);
  const [accent, setAccent] = useState(initial.accent || "#f59e0b");
  const [photo, setPhoto] = useState<string | null>(initial.photoImage);
  const [banner, setBanner] = useState<string | null>(initial.bannerImage);
  const [gallery, setGallery] = useState<string[]>(initial.gallery);
  const [certifications, setCertifications] = useState<string[]>(initial.certifications);
  const [regions, setRegions] = useState<string[]>(initial.serviceRegions);
  const [specialties, setSpecialties] = useState<string[]>(initial.specialties);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="inspector_id" value={inspectorId} />
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="accent" value={accent} />
      <input type="hidden" name="photo_image" value={photo ?? ""} />
      <input type="hidden" name="banner_image" value={banner ?? ""} />
      <input type="hidden" name="gallery" value={JSON.stringify(gallery)} />
      <input type="hidden" name="certifications" value={JSON.stringify(certifications)} />
      <input type="hidden" name="service_regions" value={JSON.stringify(regions)} />
      <input type="hidden" name="specialties" value={JSON.stringify(specialties)} />

      <div>
        <Label>Page skin</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                template === t.id ? "border-arc bg-arc/5" : "border-line hover:border-arc/40"
              )}
            >
              <p className={cn("text-sm font-semibold", template === t.id ? "text-arc" : "text-fg")}>{t.name}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{t.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <ImageUpload scope="inspector" targetId={inspectorId} value={photo} onChange={setPhoto} aspect="square" label="Logo / headshot" />
        <div>
          <Label htmlFor="ip-accent">Accent color</Label>
          <input
            id="ip-accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2 p-1"
          />
        </div>
        <div className="w-32">
          <Label htmlFor="ip-years">Years in business</Label>
          <Input id="ip-years" name="years_experience" type="number" min={0} max={79} defaultValue={initial.yearsExperience} placeholder="18" />
        </div>
      </div>

      <ImageUpload scope="inspector" targetId={inspectorId} value={banner} onChange={setBanner} label="Banner image (wide)" />

      <div>
        <Label htmlFor="ip-tagline">Tagline</Label>
        <Input id="ip-tagline" name="tagline" defaultValue={initial.tagline} maxLength={140} placeholder="AWS-certified weld inspection across the Gulf Coast" />
      </div>

      <div>
        <Label htmlFor="ip-bio">About your practice</Label>
        <Textarea id="ip-bio" name="bio" rows={5} defaultValue={initial.bio} maxLength={4000} placeholder="Your experience, approach, and why buyers trust your stamp." />
      </div>

      <TagInput label="Certifications (Enter to add)" values={certifications} onChange={setCertifications} placeholder="AWS CWI, API 510, NACE Level 2…" />
      <TagInput label="Specialties" values={specialties} onChange={setSpecialties} placeholder="Pressure vessels, structural steel, coatings…" />
      <TagInput label="Service regions" values={regions} onChange={setRegions} placeholder="Texas, Louisiana, Gulf Coast…" />

      <div>
        <Label htmlFor="ip-price">Pricing note</Label>
        <Input id="ip-price" name="pricing_note" defaultValue={initial.pricingNote} maxLength={140} placeholder="From $4,500 per audit · travel billed at cost" />
      </div>

      <div>
        <Label>Work photo gallery (up to 8)</Label>
        <div className="flex flex-wrap gap-3">
          {gallery.map((url, i) => (
            <ImageUpload
              key={url} scope="inspector" targetId={inspectorId} value={url} aspect="square" label=""
              onChange={(u) => setGallery((g) => (u ? g.map((x, j) => (j === i ? u : x)) : g.filter((_, j) => j !== i)))}
            />
          ))}
          {gallery.length < 8 && (
            <ImageUpload scope="inspector" targetId={inspectorId} value={null} aspect="square" label=""
              onChange={(u) => u && setGallery((g) => [...g, u])} />
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        <Plus size={14} /> Publish profile
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
