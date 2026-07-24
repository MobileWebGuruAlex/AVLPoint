import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, MapPin, ShieldCheck, Gavel, ClipboardCheck, Scale, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMeeting } from "@/lib/platform";
import { Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Meeting report" };

interface HireRec {
  source: "your_avl" | "avlpoint" | "none";
  pick: string | null;
  pick_vendor_id: number | null;
  verdict: string;
  comparison: string[];
  inspect: boolean;
  inspect_reason: string;
}

interface NeedSection {
  need: string; specs?: string; location?: string;
  network: { id: number; name: string; location: string; score: number; reasons: string[]; trust: string }[];
  onYourAvl: { name: string; location: string | null }[];
  recommendation?: HireRec | null;
  inspector?: { id: string; company: string; regions: string | null; house: boolean } | null;
}

export default async function MeetingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const meeting = getMeeting(id, session.userId);
  if (!meeting) notFound();

  let sections: NeedSection[] = [];
  try {
    sections = (JSON.parse(meeting.report) as { sections: NeedSection[] }).sections ?? [];
  } catch { /* corrupted report renders empty */ }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-fg-muted" aria-label="Breadcrumb">
        <Link href="/meetings" className="transition-colors hover:text-arc">Meetings</Link>
        <ChevronRight size={13} />
        <span className="truncate text-fg-secondary">{meeting.title}</span>
      </nav>

      <div className="card gradient-ring p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Meeting report</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-fg">{meeting.title}</h1>
        <p className="mt-1 font-mono text-xs text-fg-muted">
          {sections.length} needs identified · {meeting.created_at?.slice(0, 16).replace("T", " ")}
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {sections.map((s, i) => (
          <section key={i} className="card p-6">
            <p className="font-mono text-xs text-arc">NEED 0{i + 1}</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-fg">{s.need}</h2>
            {(s.specs || s.location) && (
              <p className="mt-1 text-sm text-fg-secondary">{[s.specs, s.location].filter(Boolean).join(" · ")}</p>
            )}

            {/* The verdict — who to hire */}
            {s.recommendation && s.recommendation.pick && (
              <div className="mt-4 rounded-xl border border-arc/30 bg-arc/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Gavel size={15} className="text-arc" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-arc">Recommendation</span>
                  <Badge tone={s.recommendation.source === "your_avl" ? "ok" : "arc"}>
                    {s.recommendation.source === "your_avl" ? "From your AVL" : "AVLpoint network"}
                  </Badge>
                </div>
                <p className="mt-2 flex items-center gap-2 font-display text-base font-semibold text-fg">
                  <Trophy size={16} className="text-arc" />
                  Hire {s.recommendation.pick_vendor_id ? (
                    <Link href={`/vendors/${s.recommendation.pick_vendor_id}`} className="text-arc hover:underline">
                      {s.recommendation.pick}
                    </Link>
                  ) : s.recommendation.pick}
                </p>
                {s.recommendation.verdict && (
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{s.recommendation.verdict}</p>
                )}
                {s.recommendation.comparison.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                      <Scale size={11} /> How they compare
                    </p>
                    <ul className="space-y-1">
                      {s.recommendation.comparison.map((c) => (
                        <li key={c} className="flex gap-2 text-xs leading-relaxed text-fg-secondary">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-arc" /> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.recommendation.inspect && (
                  <div className="mt-3 rounded-lg border border-ok/25 bg-ok/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ok">
                      <ClipboardCheck size={13} /> Independent inspection advised
                    </p>
                    {s.recommendation.inspect_reason && (
                      <p className="mt-1 text-xs text-fg-secondary">{s.recommendation.inspect_reason}</p>
                    )}
                    {s.inspector && (
                      <Link
                        href={`/inspections?inspector=${s.inspector.id}${s.recommendation.pick_vendor_id ? `&vendor=${s.recommendation.pick_vendor_id}` : ""}`}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/10 px-3 py-1.5 text-xs font-medium text-ok transition-colors hover:bg-ok/20"
                      >
                        <ClipboardCheck size={13} />
                        Book {s.inspector.company}{s.inspector.house ? " (house team)" : ""} →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {s.onYourAvl?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ok">On your AVL · approved</p>
                {s.onYourAvl.map((v) => (
                  <p key={v.name} className="rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-fg">
                    {v.name} <span className="text-xs text-fg-muted">{v.location}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-arc">AVLpoint network</p>
              {s.network?.map((v) => (
                <Link key={v.id} href={`/vendors/${v.id}`} className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-arc/40">
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 truncate font-display text-sm font-semibold text-fg">
                      {v.name}
                      {v.trust === "verified" && <ShieldCheck size={13} className="shrink-0 text-arc" />}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold text-arc">{v.score}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted"><MapPin size={11} />{v.location}</span>
                  {v.reasons?.length > 0 && (
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
          </section>
        ))}
      </div>
    </div>
  );
}
