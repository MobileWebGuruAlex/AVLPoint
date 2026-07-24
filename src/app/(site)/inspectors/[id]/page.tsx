import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award, MapPin, BadgeDollarSign, ClipboardCheck, ShieldCheck, Wrench, Clock, ChevronRight, Sliders,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getInspectorById } from "@/lib/platform";
import { getInspectorProfile } from "@/lib/profiles";
import { InspectorProfileEditor } from "@/components/inspector-profile-editor";
import { Badge } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ins = getInspectorById(id);
  if (!ins) return { title: "Inspector not found" };
  return { title: `${ins.company} — Inspector`, description: ins.credentials ?? undefined };
}

function jsonList(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export default async function InspectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inspector = getInspectorById(id);
  if (!inspector || (inspector.status !== "approved" && inspector.house !== 1)) {
    // Owners/staff can still preview a pending/suspended listing (checked below); otherwise 404.
    const session = await getSession();
    const canPreview =
      session && (inspector?.user_id === session.userId || (session && can(session.role, "inspectors.manage")));
    if (!inspector || !canPreview) notFound();
  }

  const session = await getSession();
  const profile = getInspectorProfile(id);
  const isOwner = session ? inspector.user_id === session.userId : false;
  const canEdit = isOwner || (session ? can(session.role, "inspectors.manage") : false);

  const template = profile?.template ?? "field";
  const accent = profile?.accent ?? "#f59e0b";
  const certs = profile ? jsonList(profile.certifications) : (inspector.credentials ? inspector.credentials.split(/·|,/).map((s) => s.trim()).filter(Boolean) : []);
  const regions = profile ? jsonList(profile.service_regions) : (inspector.regions ? inspector.regions.split(/·|,/).map((s) => s.trim()).filter(Boolean) : []);
  const specialties = profile ? jsonList(profile.specialties) : [];
  const gallery = profile ? jsonList(profile.gallery) : [];
  const pricing = profile?.pricing_note ?? inspector.base_price;

  const accentStyle = { ["--accent" as string]: accent } as React.CSSProperties;
  const bordered = template === "ledger";
  const mono = template === "ledger";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" style={accentStyle}>
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-fg-muted" aria-label="Breadcrumb">
        <Link href="/inspections" className="transition-colors hover:text-arc">Inspection marketplace</Link>
        <ChevronRight size={13} />
        <span className="truncate text-fg-secondary">{inspector.company}</span>
      </nav>

      {inspector.status !== "approved" && inspector.house !== 1 && (
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn">
          Preview — this listing is <b>{inspector.status}</b> and not yet public.
        </div>
      )}

      {/* Banner (Field skin leads with a tall banner) */}
      {profile?.banner_image && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profile.banner_image} alt="" className={template === "field" ? "h-56 w-full object-cover sm:h-72" : "h-36 w-full object-cover"} />
        </div>
      )}

      {/* Header */}
      <header className={`card relative overflow-hidden p-6 sm:p-8 ${bordered ? "border-2" : "gradient-ring"}`} style={bordered ? { borderColor: accent } : undefined}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {profile?.photo_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo_image} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-xl border" style={{ borderColor: accent, color: accent }}>
                <ClipboardCheck size={26} />
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`text-2xl font-bold tracking-tight text-fg sm:text-3xl ${mono ? "font-mono" : "font-display"}`}>
                  {inspector.company}
                </h1>
                {inspector.house === 1 ? <Badge tone="arc">House team</Badge> : <Badge tone="neutral">Independent</Badge>}
                {inspector.status === "approved" && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: accent }}>
                    <ShieldCheck size={13} /> Approved inspector
                  </span>
                )}
              </div>
              {profile?.tagline && <p className="mt-1.5 text-sm text-fg-secondary">{profile.tagline}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                {profile?.years_experience ? (
                  <span className="flex items-center gap-1"><Clock size={12} /> {profile.years_experience} yrs</span>
                ) : null}
                {pricing && <span className="flex items-center gap-1 font-mono"><BadgeDollarSign size={12} /> {pricing}</span>}
              </div>
            </div>
          </div>
          {canEdit && (
            <a href="#builder" className="flex items-center gap-1.5 self-start rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs font-medium text-fg transition-colors hover:border-arc/50">
              <Sliders size={13} /> Edit profile
            </a>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {profile?.bio && (
            <section className="card p-6">
              <h2 className="mb-3 font-display text-base font-semibold text-fg">About</h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-fg-secondary">{profile.bio}</p>
            </section>
          )}

          {specialties.length > 0 && (
            <section className="card p-6">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
                <Wrench size={16} style={{ color: accent }} /> Specialties
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {specialties.map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
            </section>
          )}

          {gallery.length > 0 && (
            <section className="card p-6">
              <h2 className="mb-3 font-display text-base font-semibold text-fg">Work in the field</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="aspect-square w-full rounded-xl border border-line object-cover" />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
              <Award size={16} style={{ color: accent }} /> Certifications
            </h2>
            {certs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {certs.map((c) => <span key={c} className="chip !border-[color:var(--accent)]/30 !text-[color:var(--accent)]">{c}</span>)}
              </div>
            ) : <p className="text-sm italic text-fg-muted">Not yet listed</p>}
          </section>

          {regions.length > 0 && (
            <section className="card p-6">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
                <MapPin size={16} style={{ color: accent }} /> Service regions
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => <span key={r} className="chip">{r}</span>)}
              </div>
            </section>
          )}

          <Link href="/inspections" className="block rounded-xl border px-4 py-3 text-center text-sm font-medium text-fg transition-colors" style={{ borderColor: accent }}>
            Request an inspection →
          </Link>
        </div>
      </div>

      {canEdit && (
        <section id="builder" className="card mt-8 scroll-mt-24 p-6">
          <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold text-fg">
            <Sliders size={16} className="text-arc" /> Profile builder
          </h2>
          <p className="mb-4 text-sm text-fg-muted">Pick a skin, add photos and credentials — publishes to your marketplace card and this page.</p>
          <InspectorProfileEditor
            inspectorId={id}
            initial={{
              template, accent: profile?.accent ?? "",
              tagline: profile?.tagline ?? "",
              bio: profile?.bio ?? "",
              photoImage: profile?.photo_image ?? null,
              bannerImage: profile?.banner_image ?? null,
              gallery, certifications: certs, serviceRegions: regions, specialties,
              pricingNote: profile?.pricing_note ?? inspector.base_price ?? "",
              yearsExperience: profile?.years_experience ? String(profile.years_experience) : "",
            }}
          />
        </section>
      )}
    </div>
  );
}
