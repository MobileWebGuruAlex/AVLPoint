"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 3D tilt-on-hover with a light glare that follows the pointer.
 * Uses CSS custom properties only — no re-renders while moving.
 * Inert on touch devices and under prefers-reduced-motion.
 */
export function Tilt({
  children,
  className,
  bodyClassName,
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--ry", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--rx", `${(0.5 - py) * 2 * max}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--glare", "1");
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--glare", "0");
  }

  return (
    <div
      ref={ref}
      className={cn("tilt-stage", className)}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className={cn("tilt-body relative", bodyClassName)}>
        {children}
        <div className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
