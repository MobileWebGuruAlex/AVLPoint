"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toggleSaveAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function SaveButton({
  vendorId,
  initialSaved,
  compact = false,
}: {
  vendorId: number;
  initialSaved: boolean;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next); // optimistic
    startTransition(async () => {
      const res = await toggleSaveAction(vendorId, next);
      if (!res.ok) setSaved(!next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-[10px] border text-sm font-medium transition-all active:scale-[0.97]",
        compact ? "h-9 px-3" : "h-10 px-4",
        saved
          ? "border-arc/50 bg-arc/10 text-arc"
          : "border-line-strong bg-surface-2 text-fg-secondary hover:border-arc/40 hover:text-fg"
      )}
    >
      {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
      {saved ? "Shortlisted" : "Add to shortlist"}
    </button>
  );
}
