import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AudioLines } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listMeetings } from "@/lib/platform";
import { MeetingRecorder } from "@/components/meeting-recorder";
import { Aurora } from "@/components/aurora";

export const metadata: Metadata = {
  title: "Meeting Recommender",
  description: "Record a project meeting; get back every procurement need matched to vendors, with reasoning.",
};

export default async function MeetingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const meetings = listMeetings(session.userId);

  return (
    <div className="relative overflow-hidden">
      <Aurora core={false} />
      <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-arc/25 bg-arc/10 text-arc">
            <AudioLines size={22} />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">The showstopper</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            End the meeting. <span className="text-gradient">Press once.</span> Get the vendors.
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-fg-secondary">
            Record the project meeting (or paste its transcript). Claude extracts every procurement
            need discussed and matches each one against your private AVL and the network.
          </p>
        </div>

        <MeetingRecorder />

        {meetings.length > 0 && (
          <div className="mt-10">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted">Meeting history</p>
            <ul className="space-y-1.5">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 text-sm text-fg transition-colors hover:border-arc/40"
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="ml-3 shrink-0 font-mono text-[10px] text-fg-muted">{m.created_at?.slice(0, 10)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
