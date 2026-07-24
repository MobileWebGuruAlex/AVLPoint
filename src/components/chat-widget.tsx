"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Send, Sparkles, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg { role: "user" | "assistant"; content: string }

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi — I'm the AVLpoint assistant. Ask me to find fabricators or suppliers, explain certifications and inspections, or show you around the platform.",
};

/** Render assistant text with **bold**, clickable /path links, and line breaks. */
function RichText({ text }: { text: string }) {
  // Split on **bold** and /paths, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\/[a-z0-9/_-]+)/gi);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) {
          return <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
        }
        if (/^\/[a-z0-9/_-]+$/i.test(p)) {
          return (
            <Link key={i} href={p} className="text-arc underline underline-offset-2 hover:opacity-80">
              {p}
            </Link>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong — try again." },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Try again in a moment." }]);
    }
    setPending(false);
  };

  return (
    <>
      {/* Launcher — glowing 3D-style orb */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={cn(
          "group fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-2xl",
          "bg-gradient-to-br from-arc to-arc-deep text-arc-ink",
          "shadow-[0_8px_30px_-6px_var(--glow)] transition-all duration-300",
          "hover:scale-105 hover:shadow-[0_12px_40px_-6px_var(--glow)] active:scale-95",
          open && "rotate-90"
        )}
        style={{ perspective: "600px" }}
      >
        <span className="absolute inset-0 rounded-2xl bg-arc/30 blur-xl transition-opacity group-hover:opacity-100" />
        {open ? <X size={22} className="relative" /> : <Bot size={24} className="relative" />}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-24 right-5 z-[60] flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface/95 backdrop-blur-xl transition-all duration-300",
          "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
        style={{ height: "min(70vh, 560px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-line bg-gradient-to-r from-arc/10 to-transparent px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-arc to-arc-deep text-arc-ink">
            <Sparkles size={15} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-fg">AVLpoint Assistant</p>
            <p className="font-mono text-[10px] text-fg-muted">grounded in the live vendor database</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-gradient-to-br from-arc to-arc-deep text-arc-ink"
                    : "border border-line bg-surface-2 text-fg-secondary"
                )}
              >
                {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-2 text-sm text-fg-muted">
                <Loader2 size={14} className="animate-spin" /> thinking…
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask about vendors, certifications, the platform…"
              className="max-h-28 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-arc/60 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-arc to-arc-deep text-arc-ink transition-opacity hover:brightness-110 disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 text-center font-mono text-[9px] text-fg-muted">
            Answers cite real vendor records · may occasionally be imperfect
          </p>
        </div>
      </div>
    </>
  );
}
