"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Sparkles, ArrowRight, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "AISC-certified structural steel fabricators in Texas",
  "AS9100 precision machine shops for titanium parts",
  "ASME pressure vessel manufacturers near Ohio",
  "sheet metal fabricators with powder coating",
  "welding shops certified for AWS D1.5 bridge work",
];

/* Minimal Web Speech API typing (Phase 2: voice search). */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
}

export function SearchBar({
  size = "lg",
  defaultValue = "",
  autoNavigate = true,
  className,
}: {
  size?: "md" | "lg";
  defaultValue?: string;
  autoNavigate?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [placeholder, setPlaceholder] = useState("Describe the vendor you need…");
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const indexRef = useRef(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Rotating example placeholder (typewriter feel without the gimmick).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % EXAMPLES.length;
      setPlaceholder(`e.g. ${EXAMPLES[indexRef.current]}`);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function toggleVoice() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setValue(text);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!autoNavigate) return;
    // Remember recent searches for the dashboard.
    if (q) {
      try {
        const prev: string[] = JSON.parse(window.localStorage.getItem("avl-recent") ?? "[]");
        const next = [q, ...prev.filter((p) => p !== q)].slice(0, 8);
        window.localStorage.setItem("avl-recent", JSON.stringify(next));
      } catch {}
    }
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form onSubmit={submit} role="search" className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative flex items-center gap-3 rounded-2xl border bg-surface transition-all duration-300",
          size === "lg" ? "h-16 px-5" : "h-12 px-4",
          focused
            ? "border-arc/60 shadow-[0_0_0_4px_color-mix(in_srgb,var(--arc)_14%,transparent),0_8px_40px_-8px_var(--glow)]"
            : "border-line-strong shadow-[var(--shadow-card)]"
        )}
      >
        <Sparkles
          size={size === "lg" ? 20 : 16}
          className={cn("shrink-0 transition-colors", focused ? "text-arc" : "text-fg-muted")}
        />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={listening ? "Listening — describe the vendor…" : placeholder}
          aria-label="Search vendors"
          className={cn(
            "h-full w-full bg-transparent text-fg placeholder:text-fg-muted focus:outline-none",
            size === "lg" ? "text-base" : "text-sm"
          )}
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? "Stop voice input" : "Search by voice"}
            title={listening ? "Stop voice input" : "Search by voice"}
            className={cn(
              "flex shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-all",
              size === "lg" ? "h-11 w-11" : "h-8 w-8",
              listening
                ? "animate-pulse border-danger/50 bg-danger/10 text-danger"
                : "border-line bg-surface-2 text-fg-muted hover:border-arc/40 hover:text-arc"
            )}
          >
            {listening ? <MicOff size={size === "lg" ? 17 : 14} /> : <Mic size={size === "lg" ? 17 : 14} />}
          </button>
        )}
        <button
          type="submit"
          aria-label="Search"
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-arc to-arc-deep font-semibold text-arc-ink transition-all hover:brightness-110 active:scale-95",
            size === "lg" ? "h-11 px-5 text-sm" : "h-8 px-3 text-xs"
          )}
        >
          {size === "lg" ? (
            <>
              Search <ArrowRight size={15} />
            </>
          ) : (
            <Search size={14} />
          )}
        </button>
      </div>
    </form>
  );
}
