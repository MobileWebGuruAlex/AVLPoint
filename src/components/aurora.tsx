import { cn } from "@/lib/utils";

/**
 * Aurora depth field — slow-drifting gradient atmosphere.
 * Pure CSS (see globals.css), GPU-composited, no JS per frame.
 * Place inside a `relative overflow-hidden` section, behind content.
 */
export function Aurora({ className, core = true }: { className?: string; core?: boolean }) {
  return (
    <div className={cn("aurora", className)} aria-hidden="true">
      {core && <div className="aurora-core" />}
    </div>
  );
}
