"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small controlled image-upload widget: picks a file, POSTs it to
 * /api/upload (auth + ownership enforced server-side), and hands back the
 * stored /uploads/… URL.
 */
export function ImageUpload({
  scope,
  targetId,
  value,
  onChange,
  label,
  aspect = "banner",
  className,
}: {
  scope: "vendor" | "inspector";
  targetId: string | number;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  aspect?: "banner" | "square";
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("scope", scope);
      body.set("id", String(targetId));
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
    setBusy(false);
  };

  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-medium text-fg-secondary">{label}</p>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2",
          aspect === "banner" ? "aspect-[4/1] min-h-20" : "aspect-square w-28"
        )}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
              aria-label={`Remove ${label}`}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-full w-full cursor-pointer items-center justify-center gap-2 text-xs text-fg-muted transition-colors hover:text-arc"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {busy ? "Uploading…" : "Add image"}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
