"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Loader2, Sparkles, AlertCircle, ShieldCheck, Printer, MapPin } from "lucide-react";
import { Button, Textarea, Input, Label } from "./ui";

/**
 * Phase 5 — The Meeting Recommender.
 * Record a meeting (browser speech-to-text, no external transcription
 * vendor needed) or paste a transcript, hit one button, and get every
 * procurement need matched to vendors with grounded reasoning.
 */

interface NeedSection {
  need: string;
  specs?: string;
  location?: string;
  query: string;
  network: {
    id: number; name: string; location: string; certifications: string[];
    score: number; reasons: string[]; trust: string;
  }[];
  onYourAvl: { name: string; location: string | null; capabilities: string | null }[];
}

interface Report { title: string; generatedAt: string; sections: NeedSection[] }

/* Minimal typing for the Web Speech API (not in lib.dom for all TS configs). */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
}

export function MeetingRecorder() {
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function toggleRecording() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalRef.current = transcript ? transcript + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  }

  async function analyze() {
    setError("");
    setAnalyzing(true);
    setReport(null);
    try {
      const res = await fetch("/api/meetings/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || "Untitled meeting", transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Analysis failed — try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (report) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => setReport(null)}>← New analysis</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Export report
          </Button>
        </div>
        <div className="card gradient-ring p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Meeting report</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-fg">{report.title}</h2>
          <p className="mt-1 font-mono text-xs text-fg-muted">
            {report.sections.length} procurement needs identified · {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        {report.sections.map((s, i) => (
          <section key={i} className="card p-6">
            <p className="font-mono text-xs text-arc">NEED 0{i + 1}</p>
            <h3 className="mt-1 font-display text-lg font-semibold text-fg">{s.need}</h3>
            {(s.specs || s.location) && (
              <p className="mt-1 text-sm text-fg-secondary">
                {s.specs}{s.specs && s.location ? " · " : ""}{s.location}
              </p>
            )}
            {s.onYourAvl.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ok">On your AVL · approved</p>
                <div className="space-y-1.5">
                  {s.onYourAvl.map((v) => (
                    <p key={v.name} className="rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-fg">
                      {v.name} <span className="text-xs text-fg-muted">{v.location}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-arc">AVLpoint network</p>
              <div className="space-y-2">
                {s.network.length === 0 && <p className="text-sm italic text-fg-muted">No confident matches.</p>}
                {s.network.map((v) => (
                  <Link key={v.id} href={`/vendors/${v.id}`} className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-arc/40">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 truncate font-display text-sm font-semibold text-fg">
                        {v.name}
                        {v.trust === "verified" && <ShieldCheck size={13} className="shrink-0 text-arc" />}
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold text-arc">{v.score}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted"><MapPin size={11} />{v.location}</span>
                    {v.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {v.reasons.slice(0, 3).map((r) => (
                          <li key={r} className="flex gap-2 text-xs leading-relaxed text-fg-secondary">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-arc" /> {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ))}
        <p className="font-mono text-[10px] text-fg-muted print:hidden">
          Recommendations grounded in database records · network results labeled · saved to your meeting history
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="space-y-4">
        <div>
          <Label htmlFor="mtitle">Meeting title</Label>
          <Input id="mtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unit 4 turnaround planning" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="mtranscript" className="!mb-0">Transcript</Label>
            {speechSupported ? (
              <button
                type="button"
                onClick={toggleRecording}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                  recording ? "border-danger/50 bg-danger/10 text-danger" : "border-arc/40 bg-arc/10 text-arc hover:bg-arc/20"
                }`}
              >
                {recording ? <><Square size={11} /> stop recording</> : <><Mic size={11} /> record meeting</>}
              </button>
            ) : (
              <span className="font-mono text-[10px] text-fg-muted">live recording needs Chrome/Edge — paste a transcript instead</span>
            )}
          </div>
          <Textarea
            id="mtranscript"
            rows={9}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={recording ? "Listening — speak naturally…" : "Record live, or paste a meeting transcript here. Mention what you need to buy or fabricate, specs, and locations."}
          />
          {recording && (
            <p className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-danger">
              <span className="status-dot !bg-danger" /> recording — transcribed locally in your browser, nothing uploaded until you analyze
            </p>
          )}
        </div>
        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={analyze} disabled={analyzing || transcript.trim().length < 40} size="lg" className="shine">
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Get recommendations
          </Button>
          {analyzing && (
            <span className="font-mono text-xs text-fg-secondary">
              extracting needs → searching → ranking… (up to a minute)
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-fg-muted">
          One button: Claude extracts every procurement need mentioned, searches your private AVL and
          the network for each one, and returns ranked vendors with the reasoning shown.
        </p>
      </div>
    </div>
  );
}
