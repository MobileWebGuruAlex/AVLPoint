"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { CHAPTERS, CHAPTER_LABELS, TRACK_VH } from "./copy";
import { scrollState } from "./scroll-state";
import { FramePlayer } from "./frame-player";
import { Overlay } from "./overlay";
import { Hud } from "./hud";
import "./landing.css";

const Scene3D = dynamic(() => import("./scene3d/canvas-root"), { ssr: false });

gsap.registerPlugin(ScrollTrigger);

/**
 * The cinematic landing orchestrator.
 *
 * Scroll model: a tall invisible track (TRACK_VH) provides scroll length while
 * a fixed stage renders the film. One ScrollTrigger scrubs a 10-unit master
 * timeline (1 unit per chapter) that choreographs every HTML reveal; the same
 * progress value feeds the canvas frame player and the 3D accent layer through
 * a mutable store — a single source of truth, three render layers.
 */

/** Build every scrubbed tween. Positions are absolute chapter units [0..10]. */
function buildScrub(tl: gsap.core.Timeline, q: gsap.utils.SelectorFunc) {
  for (let i = 0; i < 10; i++) {
    const items = q(`[data-ch="${i}"] [data-r]`);
    if (!items.length) continue;

    if (i > 0) {
      tl.fromTo(
        items,
        { autoAlpha: 0, y: 54 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.out",
          immediateRender: false,
        },
        i + 0.08
      );
    }
    if (i < 9) {
      tl.fromTo(
        q(`[data-ch="${i}"] .lp-copy`),
        { autoAlpha: 1, y: 0 },
        { autoAlpha: 0, y: -46, duration: 0.18, ease: "power2.in", immediateRender: false },
        i + 0.84
      );
    }
  }

  // — chapter 2: the late resolve line as the chaos re-forms
  tl.fromTo(
    q('[data-ch="1"] [data-beat]'),
    { autoAlpha: 0, y: 30 },
    { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out", immediateRender: false },
    1.58
  );

  // — chapter 4: workflow steps land one by one, each igniting as it arrives
  for (let j = 0; j < 3; j++) {
    tl.fromTo(
      q(`[data-step="${j}"]`),
      { autoAlpha: 0, y: 44 },
      { autoAlpha: 1, y: 0, duration: 0.16, ease: "power2.out", immediateRender: false },
      3.24 + j * 0.17
    );
    tl.fromTo(
      q(`[data-step="${j}"] .lp-step-glow`),
      { opacity: 0 },
      { opacity: 1, duration: 0.1, immediateRender: false },
      3.34 + j * 0.17
    ).to(
      q(`[data-step="${j}"] .lp-step-glow`),
      { opacity: 0.25, duration: 0.2 },
      3.5 + j * 0.17
    );
  }

  // — chapter 5: the vendor breakthrough (beat → flash → unlocked channel)
  tl.fromTo(
    q('[data-ch="4"] [data-beat]'),
    { autoAlpha: 0, y: 30 },
    { autoAlpha: 1, y: 0, duration: 0.18, ease: "power2.out", immediateRender: false },
    4.46
  );
  tl.fromTo(
    q("[data-flash]"),
    { opacity: 0 },
    { opacity: 0.6, duration: 0.05, immediateRender: false },
    4.6
  ).to(q("[data-flash]"), { opacity: 0, duration: 0.16 }, 4.66);
  tl.fromTo(
    q('[data-ch="4"] [data-unlock]'),
    { autoAlpha: 0, scale: 0.88 },
    { autoAlpha: 1, scale: 1, duration: 0.14, ease: "back.out(2.2)", immediateRender: false },
    4.63
  );

  // — chapter 8: architecture node labels ring the frame
  for (let j = 0; j < 3; j++) {
    tl.fromTo(
      q(`[data-arch="${j}"]`),
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.14, immediateRender: false },
      7.3 + j * 0.12
    );
    tl.fromTo(
      q(`[data-arch="${j}"]`),
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: 0.14, immediateRender: false },
      7.86
    );
  }

  // — chapter 10: the invitation
  tl.fromTo(
    q("[data-cta]"),
    { autoAlpha: 0, y: 34 },
    { autoAlpha: 1, y: 0, duration: 0.26, ease: "power2.out", immediateRender: false },
    9.32
  );

  // pin the timeline's total duration to exactly 10 units
  tl.set({}, {}, 10);
}

export function Landing() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [mode, setMode] = useState<"boot" | "film" | "static">("boot");

  useEffect(() => {
    setMode(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "static" : "film");
  }, []);

  useEffect(() => {
    if (mode !== "film") return;
    const root = rootRef.current;
    if (!root) return;

    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const counterEl = root.querySelector<HTMLElement>("[data-counter]");
    const railFill = root.querySelector<HTMLElement>("[data-railfill]");
    const cueEl = root.querySelector<HTMLElement>("[data-cue]");
    const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);

      // opening beats — play once on arrival, independent of scroll
      gsap.fromTo(
        q('[data-ch="0"] [data-r]'),
        { autoAlpha: 0, y: 42 },
        { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.14, ease: "power3.out", delay: 0.5 }
      );
      gsap.fromTo(
        q("[data-topbar]"),
        { autoAlpha: 0, y: -22 },
        { autoAlpha: 1, y: 0, duration: 0.9, ease: "power2.out", delay: 1.0 }
      );
      gsap.fromTo(q("[data-rail]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, delay: 1.3 });
      gsap.fromTo(q("[data-cue]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, delay: 1.8 });

      const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
      buildScrub(tl, q);

      let lastP = 0;
      let lastT = performance.now();

      ScrollTrigger.create({
        trigger: root.querySelector(".lp-track"),
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        animation: tl,
        invalidateOnRefresh: true,
        onUpdate(self) {
          const now = performance.now();
          const dt = Math.max(now - lastT, 1) / 1000;
          const v = (self.progress - lastP) / dt;
          scrollState.v += (v - scrollState.v) * Math.min(1, dt * 8);
          scrollState.p = self.progress;
          lastP = self.progress;
          lastT = now;

          const ch = Math.min(9, Math.floor(self.progress * 10));
          if (ch !== scrollState.chapter) {
            scrollState.chapter = ch;
            root.dataset.chapter = String(ch);
            if (counterEl) {
              counterEl.textContent = `${String(ch + 1).padStart(2, "0")} · ${CHAPTER_LABELS[ch]}`;
            }
            for (let i = 0; i < dots.length; i++) {
              if (i === ch) dots[i].setAttribute("data-active", "");
              else dots[i].removeAttribute("data-active");
            }
          }
          if (railFill) railFill.style.transform = `scaleY(${self.progress})`;
          if (cueEl) cueEl.style.opacity = self.progress > 0.015 ? "0" : "";
        },
      });
    }, root);

    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [mode]);

  const jump = useCallback((i: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = i === 0 ? 0 : max * ((i + 0.5) / 10);
    lenisRef.current?.scrollTo(target, { duration: 1.6 });
  }, []);

  if (mode === "static") return <StaticLanding />;

  return (
    <div ref={rootRef} className="lp-root" data-chapter="0">
      <div className="lp-track" style={{ height: `${TRACK_VH}vh` }} aria-hidden="true" />
      <div className="lp-stage">
        <FramePlayer />
        {mode === "film" && <Scene3D />}
        <div className="lp-scrim" aria-hidden="true" />
        <div className="lp-vignette" aria-hidden="true" />
        <Overlay />
        <Hud onJump={jump} />
      </div>
    </div>
  );
}

/** Reduced-motion fallback: the same story as calm, scrollable sections. */
function StaticLanding() {
  return (
    <div className="lps-root">
      <header className="lp-topbar" style={{ opacity: 1, visibility: "visible", position: "sticky" }}>
        <div className="lp-brand">
          <LogoMark size={26} />
          <span className="lp-brand-word">
            AVL<b>point</b>
          </span>
        </div>
        <Link href="/home" className="lp-btn-solid lp-btn-sm">
          Enter AVLpoint <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      {CHAPTERS.map((c, i) => (
        <section className="lps-section" key={c.key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative poster, cover-fit */}
          <img className="lps-poster" src={c.poster} alt="" loading={i > 1 ? "lazy" : "eager"} />
          <div className="lps-copy">
            <p className="lp-kicker">{c.kicker}</p>
            {i === 0 ? <h1 className="lp-title">{c.title}</h1> : <h2 className="lp-title">{c.title}</h2>}
            {c.lines.map((l) => (
              <p className="lp-line" key={l.slice(0, 24)}>
                {l}
              </p>
            ))}
            {c.detail && <p className="lp-detail">{c.detail}</p>}
            {c.chips && (
              <div className="lp-chips">
                {c.chips.map((chip) => (
                  <span className="lp-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {i === 9 && (
              <div className="lps-cta">
                <Link href="/home" className="lp-btn-solid lp-btn-lg">
                  Enter AVLpoint <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link href="/contact" className="lp-btn-ghost lp-btn-lg">
                  Talk to us
                </Link>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
