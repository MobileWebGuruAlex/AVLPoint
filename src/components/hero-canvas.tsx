"use client";

/**
 * "Vendor constellation" — a lightweight 3D-projected particle field.
 * Colors are resolved ONCE per theme change (never inside the render
 * loop) and pre-baked into rgba() strings. Pure canvas, no dependencies.
 */
import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  z: number;
  seed: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [56, 200, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function HeroCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };

    const N = 90;
    const nodes: Node[] = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2,
      seed: Math.random() * Math.PI * 2,
    }));

    // Pre-baked color tables (indexed by alpha step) — resolved on theme change only.
    let arcRgb: [number, number, number] = [56, 200, 255];
    let mutedRgb: [number, number, number] = [92, 107, 130];
    const ALPHA_STEPS = 20;
    let arcTable: string[] = [];
    let mutedTable: string[] = [];

    function readTheme() {
      const styles = getComputedStyle(document.documentElement);
      arcRgb = hexToRgb(styles.getPropertyValue("--arc") || "#38c8ff");
      mutedRgb = hexToRgb(styles.getPropertyValue("--fg-muted") || "#5c6b82");
      arcTable = [];
      mutedTable = [];
      for (let i = 0; i <= ALPHA_STEPS; i++) {
        const a = (i / ALPHA_STEPS).toFixed(3);
        arcTable.push(`rgba(${arcRgb[0]},${arcRgb[1]},${arcRgb[2]},${a})`);
        mutedTable.push(`rgba(${mutedRgb[0]},${mutedRgb[1]},${mutedRgb[2]},${a})`);
      }
    }

    function color(table: string[], alpha: number): string {
      const i = Math.max(0, Math.min(ALPHA_STEPS, Math.round(alpha * ALPHA_STEPS)));
      return table[i];
    }

    function resize() {
      if (!canvas) return;
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const projected: { px: number; py: number; depth: number }[] = new Array(N);

    function frame(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const time = reduced ? 0 : t * 0.00008;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * 0.42;
      const cos = Math.cos(time);
      const sin = Math.sin(time);

      for (let i = 0; i < N; i++) {
        const n = nodes[i];
        const drift = reduced ? 0 : Math.sin(t * 0.0004 + n.seed) * 0.04;
        const x = n.x * cos - n.z * sin;
        const z = n.x * sin + n.z * cos;
        const y = n.y + drift;
        const persp = 1.6 / (1.6 + z);
        projected[i] = {
          px: cx + x * scale * persp,
          py: cy + y * scale * 0.72 * persp,
          depth: persp,
        };
      }

      // links
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        const a = projected[i];
        for (let k = i + 1; k < N; k++) {
          const b = projected[k];
          const dx = a.px - b.px;
          const dy = a.py - b.py;
          const d2 = dx * dx + dy * dy;
          if (d2 > 110 * 110) continue;
          const d = Math.sqrt(d2);
          const midX = (a.px + b.px) / 2;
          const midY = (a.py + b.py) / 2;
          const mdx = midX - mouse.x;
          const mdy = midY - mouse.y;
          const near = Math.max(0, 1 - Math.sqrt(mdx * mdx + mdy * mdy) / 220);
          const alpha = (1 - d / 110) * 0.16 + near * 0.35;
          ctx.strokeStyle =
            near > 0.05 ? color(arcTable, alpha) : color(mutedTable, alpha);
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(b.px, b.py);
          ctx.stroke();
        }
      }

      // nodes
      for (let i = 0; i < N; i++) {
        const p = projected[i];
        const r = 1.1 * p.depth + 0.4;
        const mdx = p.px - mouse.x;
        const mdy = p.py - mouse.y;
        const near = Math.max(0, 1 - Math.sqrt(mdx * mdx + mdy * mdy) / 200);
        const alpha = Math.min(1, 0.35 + p.depth * 0.4 + near * 0.25);
        ctx.fillStyle = near > 0.05 ? color(arcTable, alpha) : color(mutedTable, alpha);
        ctx.beginPath();
        ctx.arc(p.px, p.py, r + near * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    readTheme();
    resize();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
