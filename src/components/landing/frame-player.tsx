"use client";
// imperative canvas engine; nothing here is memoizable
"use no memo";

import { useEffect, useRef } from "react";
import manifest from "./frame-manifest.json";
import { CHAPTERS } from "./copy";
import { scrollState } from "./scroll-state";

/**
 * Full-viewport <canvas> that scrubs the 10 chapter clips as frame sequences.
 *
 * Memory strategy (the hard constraint — 10 chapters × ~96 frames of decoded
 * RGBA at 1600px would be gigabytes):
 *   - compressed WebP blobs are prefetched for the active chapter ± 1 and kept
 *     (~7 MB per chapter — cheap);
 *   - decoded ImageBitmaps live only in a sliding window around the current
 *     frame (±DECODE_AHEAD), decoded ahead in the scroll direction and closed
 *     when they leave the window;
 *   - each chapter's first and last frames stay pinned so chapter crossfades
 *     always have pixels, even mid-flick;
 *   - posters (one still per chapter) draw instantly until frames stream in.
 *
 * Chapter boundaries crossfade over BLEND units of local progress. Chapter 5→6
 * shares an identical frame at the cut (clip 6 starts on clip 5's final frame),
 * so that transition is seamless by construction.
 */

const N = 10;
const BLEND = 0.16; // crossfade width at each chapter boundary (local-t units)
const DECODE_AHEAD = 22; // decoded frames kept on each side of the playhead
const FETCH_CONCURRENCY = 8;

type Counts = Record<string, number>;
const COUNTS: Counts = (manifest as { chapters: Counts }).chapters;

interface ChapterCache {
  key: string;
  count: number; // 0 → no frames yet, poster only
  blobs: (Blob | null)[];
  bitmaps: (ImageBitmap | null)[];
  fetching: boolean;
}

function frameUrl(dir: string, key: string, i: number) {
  return `/landing/${dir}/${key}/f_${String(i + 1).padStart(3, "0")}.webp`;
}

export function FramePlayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let disposed = false;
    let raf = 0;
    let lastDrawKey = "";
    let lastP = 0;
    let fade = 0; // eases the film in from black once first pixels are ready

    // Mobile devices get the 960px frame set and a tighter decode budget.
    const small =
      window.innerWidth < 768 ||
      (navigator.hardwareConcurrency ?? 8) <= 4;
    const dir = small ? "frames-m" : "frames";
    const decodeAhead = small ? 14 : DECODE_AHEAD;

    const chapters: ChapterCache[] = CHAPTERS.map((c) => ({
      key: c.key,
      count: COUNTS[c.key] ?? 0,
      blobs: [],
      bitmaps: [],
      fetching: false,
    }));

    // ---- posters ---------------------------------------------------------
    const posters: (HTMLImageElement | null)[] = CHAPTERS.map(() => null);
    function loadPoster(i: number, eager = false) {
      if (posters[i]) return;
      const img = new Image();
      if (eager) img.fetchPriority = "high";
      img.src = CHAPTERS[i].poster;
      img.decode().catch(() => undefined);
      posters[i] = img;
    }
    loadPoster(0, true);
    loadPoster(1);

    // ---- sizing ----------------------------------------------------------
    let cw = 0;
    let chh = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      cw = Math.round(window.innerWidth * dpr);
      chh = Math.round(window.innerHeight * dpr);
      if (canvas) {
        canvas.width = cw;
        canvas.height = chh;
      }
      lastDrawKey = ""; // force redraw
    }
    resize();
    window.addEventListener("resize", resize);

    // ---- blob prefetch ---------------------------------------------------
    async function fetchChapterBlobs(ch: ChapterCache) {
      if (ch.fetching || ch.count === 0 || ch.blobs.length) return;
      ch.fetching = true;
      ch.blobs = new Array(ch.count).fill(null);
      ch.bitmaps = new Array(ch.count).fill(null);
      // priority order: first, last, then every 6th, then the rest
      const order: number[] = [0, ch.count - 1];
      for (let i = 0; i < ch.count; i += 6) order.push(i);
      for (let i = 0; i < ch.count; i++) order.push(i);
      const seen = new Set<number>();
      const queue = order.filter((i) => {
        if (seen.has(i) || i < 0) return false;
        seen.add(i);
        return true;
      });
      let cursor = 0;
      async function worker() {
        while (cursor < queue.length && !disposed) {
          const idx = queue[cursor++];
          try {
            const res = await fetch(frameUrl(dir, ch.key, idx));
            if (res.ok) ch.blobs[idx] = await res.blob();
          } catch {
            /* transient network failure — poster/nearest frame covers it */
          }
        }
      }
      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
      ch.fetching = false;
      lastDrawKey = "";
    }

    // ---- decode window ---------------------------------------------------
    const decodedList: { ch: number; i: number }[] = [];
    let decoding = 0;
    const decodingSet = new Set<string>();

    function ensureDecoded(chIdx: number, center: number, direction: number) {
      const ch = chapters[chIdx];
      if (ch.count === 0 || !ch.blobs.length) return;
      const lo = Math.max(0, center - decodeAhead);
      const hi = Math.min(ch.count - 1, center + decodeAhead);
      // decode playhead-out, biased toward scroll direction
      const wants: number[] = [center];
      for (let d = 1; d <= decodeAhead; d++) {
        wants.push(center + d * (direction >= 0 ? 1 : -1));
        wants.push(center - d * (direction >= 0 ? 1 : -1));
      }
      for (const i of wants) {
        if (i < lo || i > hi || decoding > 5) continue;
        if (ch.bitmaps[i] || !ch.blobs[i]) continue;
        
        const decodeKey = `${chIdx}:${i}`;
        if (decodingSet.has(decodeKey)) continue;

        decoding++;
        decodingSet.add(decodeKey);
        
        const blob = ch.blobs[i]!;
        createImageBitmap(blob)
          .then((bmp) => {
            if (disposed) {
              bmp.close();
              return;
            }
            ch.bitmaps[i] = bmp;
            decodedList.push({ ch: chIdx, i });
            lastDrawKey = "";
          })
          .catch(() => undefined)
          .finally(() => {
            decoding--;
            decodingSet.delete(decodeKey);
          });
      }
      // evict decoded frames far outside every chapter's window
      const budget = small ? 70 : 110;
      let checked = 0;
      const initialLength = decodedList.length;
      while (decodedList.length > budget && checked < initialLength) {
        checked++;
        const victim = decodedList.shift()!;
        const vch = chapters[victim.ch];
        const keep =
          victim.i === 0 ||
          victim.i === vch.count - 1 ||
          (victim.ch === chIdx && Math.abs(victim.i - center) <= decodeAhead);
        if (keep) {
          decodedList.push(victim); // rotate pinned frames back
          continue;
        }
        vch.bitmaps[victim.i]?.close();
        vch.bitmaps[victim.i] = null;
      }
    }

    function nearestBitmap(ch: ChapterCache, i: number): ImageBitmap | null {
      if (ch.bitmaps[i]) return ch.bitmaps[i];
      for (let d = 1; d < ch.count; d++) {
        if (ch.bitmaps[i - d]) return ch.bitmaps[i - d];
        if (ch.bitmaps[i + d]) return ch.bitmaps[i + d];
      }
      return null;
    }

    // ---- drawing ---------------------------------------------------------
    function drawCover(src: CanvasImageSource, w: number, h: number, alpha: number) {
      if (!ctx) return;
      const s = Math.max(cw / w, chh / h);
      const dw = w * s;
      const dh = h * s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(src, (cw - dw) / 2, (chh - dh) / 2, dw, dh);
    }

    function drawLayer(chIdx: number, t: number, alpha: number): boolean {
      const ch = chapters[chIdx];
      if (ch.count > 0) {
        const idx = Math.max(0, Math.min(ch.count - 1, Math.round(t * (ch.count - 1))));
        const bmp = nearestBitmap(ch, idx);
        if (bmp) {
          drawCover(bmp, bmp.width, bmp.height, alpha);
          return true;
        }
      }
      const poster = posters[chIdx];
      if (poster && poster.complete && poster.naturalWidth > 0) {
        drawCover(poster, poster.naturalWidth, poster.naturalHeight, alpha);
        return true;
      }
      return false;
    }

    function tick() {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      const p = scrollState.p;
      const x = Math.min(N - 1e-6, Math.max(0, p * N));
      const i = Math.floor(x);
      const t = x - i;
      const direction = p >= lastP ? 1 : -1;
      lastP = p;

      // keep caches warm for active chapter ± 1
      for (const d of [0, 1, -1]) {
        const c = i + d;
        if (c >= 0 && c < N) {
          loadPoster(c);
          void fetchChapterBlobs(chapters[c]);
        }
      }
      const ch = chapters[i];
      if (ch.count > 0) {
        const center = Math.round(t * (ch.count - 1));
        ensureDecoded(i, center, direction);
      }
      // pre-decode neighbour edge frames for a clean crossfade
      if (i + 1 < N && chapters[i + 1].count > 0 && t > 0.7) {
        ensureDecoded(i + 1, 0, 1);
      }
      if (i > 0 && chapters[i - 1].count > 0 && t < 0.3) {
        ensureDecoded(i - 1, chapters[i - 1].count - 1, -1);
      }

      // frame-accurate draw key — skip redundant redraws
      const fi = ch.count > 0 ? Math.round(t * (ch.count - 1)) : -1;
      const blendIn = i > 0 && t < BLEND ? (BLEND - t) / BLEND : 0;
      const blendKey = blendIn > 0 ? blendIn.toFixed(2) : "0";
      const key = `${i}:${fi}:${t.toFixed(3)}:${blendKey}:${cw}:${fade.toFixed(2)}`;
      if (key === lastDrawKey) return;
      lastDrawKey = key;

      if (!ctx) return;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#05070c";
      ctx.fillRect(0, 0, cw, chh);

      let drew = false;
      if (blendIn > 0) {
        // ease the previous chapter's final frame out underneath
        drew = drawLayer(i - 1, 1, fade);
        drew = drawLayer(i, t, (1 - blendIn) * fade) || drew;
      } else {
        drew = drawLayer(i, t, fade);
      }
      if (drew && fade < 1) fade = Math.min(1, fade + 0.055);
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      for (const ch of chapters) {
        for (const b of ch.bitmaps) b?.close();
        ch.bitmaps = [];
        ch.blobs = [];
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="lp-film" aria-hidden="true" />;
}
