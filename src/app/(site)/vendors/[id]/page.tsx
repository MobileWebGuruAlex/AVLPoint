import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  Building2,
  Calendar,
  ChevronRight,
  Factory,
  Fingerprint,
  Globe,
  Mail,
  MapPin,
  Phone,
  Ruler,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { getVendorById, getSimilarVendors, getSavedIds } from "@/lib/vendors";
import { getSession } from "@/lib/auth";
import { getCertification, isVendorOwner, getEnrichment } from "@/lib/platform";
import { getVendorProfile } from "@/lib/profiles";
import { getPendingClaim } from "@/lib/profiles";
import { jsonList, jsonObject, vendorLocation, hostname, formatNumber } from "@/lib/utils";
import { ButtonLink } from "@/components/ui";
import { VendorCard, VendorLogo, TierBadge, TrustBadge } from "@/components/vendor-card";
import { SaveButton } from "@/components/save-button";
import { VendorProfileEditor } from "@/components/vendor-profile-editor";
import { ClaimVerifyPanel } from "@/components/claim-verify-panel";
import { BadgeCheck, Lock, Images, Sliders, UserCheck } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendorById(Number(id));
  if (!vendor) return { title: "Vendor not found" };
  return {
    title: vendor.company_name,
    description:
      vendor.ai_summary ??
      vendor.company_description ??
      `${vendor.company_name} — industrial vendor profile on AVLpoint.`,
  };
}

function ChipList({ items, accent = false }: { items: string[]; accent?: boolean }) {
  if (items.length === 0) return <p className="text-sm italic text-fg-muted">Not yet on file</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span key={c} className={accent ? "chip !border-arc/25 !text-arc" : "chip"}>
          {c}
        </span>
      ))}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold text-fg">
        <Icon size={17} className="text-arc" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="mt-0.5 shrink-0 text-fg-muted" />
      <div className="min-w-0">
        <p className="text-xs text-fg-muted">{label}</p>
        <p className="truncate text-sm font-medium text-fg">{value}</p>
      </div>
    </div>
  );
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendorId = Number(id);
  if (!Number.isFinite(vendorId)) notFound();

  const vendor = await getVendorById(vendorId);
  if (!vendor) notFound();

  const session = await getSession();
  const [similar, savedIds] = await Promise.all([
    getSimilarVendors(vendor),
    session ? getSavedIds(session.userId) : Promise.resolve(new Set<number>()),
  ]);
  const certification = getCertification(vendorId);
  const enrichment = getEnrichment(vendorId);
  const owner = session ? isVendorOwner(vendorId, session.userId) : false;
  const profile = getVendorProfile(vendorId);
  const pendingClaim = session && !owner ? getPendingClaim(vendorId, session.userId) : null;

  // Owner branding (only applied once a verified owner has published it).
  const accent = profile?.accent ?? null;
  const template = profile?.template ?? "classic";
  // Owner-uploaded gallery wins; otherwise fall back to pipeline-scraped
  // site photos (representative_images, capped at 5 — more is a paid feature).
  const ownerGallery = profile ? (JSON.parse(profile.gallery || "[]") as string[]) : [];
  let scrapedImages: string[] = [];
  try {
    scrapedImages = JSON.parse((vendor as { representative_images?: string }).representative_images || "[]");
  } catch { /* malformed legacy value — ignore */ }
  const galleryImages = (ownerGallery.length ? ownerGallery : scrapedImages).slice(0, 5);
  const highlights = profile
    ? (JSON.parse(profile.highlights || "[]") as { label: string; value: string }[])
    : [];
  const accentStyle = accent ? ({ ["--accent" as string]: accent } as React.CSSProperties) : undefined;

  const certs = jsonList(vendor.certifications_held);
  const capabilities = [
    ...jsonList(vendor.capabilities),
    ...jsonList(vendor.fabrication_capabilities),
  ];
  const services = jsonList(vendor.services);
  const industries = jsonList(vendor.industries_served);
  const equipment = jsonList(vendor.equipment_list);
  const materials = jsonList(vendor.materials_handled);
  const welding = jsonList(vendor.welding_processes);
  const qa = jsonList(vendor.inspection_and_qa_capabilities);
  const customers = jsonList(vendor.notable_customers);
  const provenance = jsonObject(vendor.data_provenance);
  const provenanceSources = [
    ...new Set(Object.values(provenance).map(String).filter((s) => s && s !== "{}")),
  ];
  const host = hostname(vendor.website_url);
  const sqft = vendor.facility_size_sqft ? Number(String(vendor.facility_size_sqft).replace(/\D/g, "")) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" style={accentStyle}>
      {/* Owner-published banner (Bold/Blueprint templates lead with it) */}
      {profile?.banner_image && (
        <div className="anim-fade-up mb-6 overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.banner_image}
            alt={`${vendor.company_name} banner`}
            className={template === "bold" ? "h-56 w-full object-cover sm:h-72" : "h-40 w-full object-cover"}
          />
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-fg-muted" aria-label="Breadcrumb">
        <Link href="/search" className="transition-colors hover:text-arc">
          Vendors
        </Link>
        <ChevronRight size={13} />
        <span className="truncate text-fg-secondary">{vendor.company_name}</span>
      </nav>

      {/* Header */}
      <header className="card gradient-ring anim-fade-up relative overflow-hidden p-6 sm:p-8">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(180deg,black,transparent_70%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <VendorLogo vendor={vendor} size={72} />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                  {vendor.company_name}
                </h1>
                <TrustBadge vendor={vendor} certified={Boolean(certification)} />
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-secondary">
                <MapPin size={14} className="text-fg-muted" />
                {vendorLocation(vendor)}
                {vendor.primary_business_type && (
                  <>
                    <span className="text-fg-muted">·</span>
                    {vendor.primary_business_type}
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TierBadge tier={vendor.enterprise_tier} />
                {vendor.enterprise_suitability_score > 0 && (
                  <span className="font-mono text-xs text-fg-muted">
                    suitability {vendor.enterprise_suitability_score}/100
                  </span>
                )}
                {certification && (
                  <span className="font-mono text-xs text-ok">
                    certified · expires {certification.expires_at}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <SaveButton vendorId={vendor.id} initialSaved={savedIds.has(vendor.id)} />
            {vendor.website_url && (
              <ButtonLink href={vendor.website_url} target="_blank" rel="noopener noreferrer" variant="secondary">
                <Globe size={15} /> {host ?? "Website"}
              </ButtonLink>
            )}
            <ButtonLink href={`/claim?vendor=${vendor.id}`} variant="ghost" size="sm">
              <BadgeCheck size={14} /> Claim this company
            </ButtonLink>
          </div>
        </div>
      </header>

      {/* Owner tagline (published) */}
      {profile?.tagline && (
        <p className="mt-4 border-l-2 pl-3 text-base font-medium italic text-fg-secondary"
           style={{ borderColor: accent ?? "var(--arc)" }}>
          {profile.tagline}
        </p>
      )}

      {/* Claim verification banner — visible to the pending claimant */}
      {pendingClaim && (
        <ClaimVerifyPanel
          vendorId={vendor.id}
          token={pendingClaim.verify_token}
          website={vendor.website_url}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Owner-written about (published) */}
          {profile?.about && (
            <Section icon={BadgeCheck} title={`About ${vendor.company_name}`}>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-fg-secondary">{profile.about}</p>
              {highlights.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {highlights.map((h) => (
                    <div key={h.label} className="rounded-xl border border-line p-3 text-center">
                      <p className="font-display text-lg font-bold" style={{ color: accent ?? "var(--arc)" }}>{h.value}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">{h.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {galleryImages.length > 0 && (
            <Section icon={Images} title="Gallery">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {galleryImages.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="aspect-square w-full rounded-xl border border-line object-cover" />
                ))}
              </div>
            </Section>
          )}

          {(() => {
            // Prefer the comprehensive AI synopsis (the full enriched profile) as the
            // primary description; fall back to the shorter summary/description.
            const primary =
              vendor.ai_synopsis && vendor.ai_synopsis.length > 200
                ? vendor.ai_synopsis
                : vendor.ai_summary ?? vendor.company_description ?? null;
            const secondary =
              primary === vendor.ai_synopsis
                ? (vendor.ai_summary && vendor.ai_summary !== vendor.ai_synopsis ? vendor.ai_summary : null)
                : (vendor.ai_synopsis && vendor.ai_synopsis !== primary ? vendor.ai_synopsis : null);
            return (
              <Section icon={Sparkles} title="Company profile">
                {primary ? (
                  <div className="space-y-3 whitespace-pre-line text-[15px] leading-relaxed text-fg-secondary">
                    {primary.split(/\n{2,}/).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-fg-muted">
                    This profile is queued for AI enrichment. Core facts below come from source
                    registries.
                  </p>
                )}
                {secondary && (
                  <p className="mt-4 border-l-2 border-arc/40 pl-3 text-sm leading-relaxed text-fg-muted">
                    {secondary}
                  </p>
                )}
              </Section>
            );
          })()}

          {(enrichment?.summary || enrichment?.capabilities) && (
            <Section icon={UserCheck} title="From the owner">
              {enrichment.summary && (
                <p className="text-[15px] leading-relaxed text-fg-secondary">{enrichment.summary}</p>
              )}
              {enrichment.capabilities && (
                <div className="mt-3">
                  <ChipList items={enrichment.capabilities.split(",").map((s) => s.trim()).filter(Boolean)} accent />
                </div>
              )}
              <p className="mt-3 font-mono text-[10px] text-fg-muted">
                first-party · provided by the claimed profile owner · {enrichment.updated_at?.slice(0, 10)}
              </p>
            </Section>
          )}

          {owner && (
            <Section icon={Sliders} title="Profile builder — customize your card & page">
              <p className="mb-4 text-sm text-fg-muted">
                You own this profile. Pick a template, set your brand color, add photos, and write your
                story — changes publish to your public page and search card instantly.
              </p>
              <VendorProfileEditor
                vendorId={vendor.id}
                initial={{
                  template,
                  accent: accent ?? "",
                  tagline: profile?.tagline ?? "",
                  about: profile?.about ?? enrichment?.summary ?? "",
                  bannerImage: profile?.banner_image ?? null,
                  gallery: galleryImages,
                  highlights,
                }}
              />
            </Section>
          )}

          {certs.length > 0 && (
            <Section icon={Award} title="Certifications & qualifications">
              <ChipList items={certs} accent />
            </Section>
          )}

          {(capabilities.length > 0 || services.length > 0 || welding.length > 0) && (
            <Section icon={Wrench} title="Capabilities & services">
              <div className="space-y-4">
                {capabilities.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Capabilities
                    </p>
                    <ChipList items={capabilities} />
                  </div>
                )}
                {services.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Services
                    </p>
                    <ChipList items={services} />
                  </div>
                )}
                {welding.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Welding processes
                    </p>
                    <ChipList items={welding} />
                  </div>
                )}
              </div>
            </Section>
          )}

          {(equipment.length > 0 || materials.length > 0 || qa.length > 0) && (
            <Section icon={Factory} title="Shop floor">
              <div className="space-y-4">
                {equipment.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Equipment
                    </p>
                    <ChipList items={equipment} />
                  </div>
                )}
                {materials.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Materials handled
                    </p>
                    <ChipList items={materials} />
                  </div>
                )}
                {qa.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Inspection & QA
                    </p>
                    <ChipList items={qa} />
                  </div>
                )}
              </div>
            </Section>
          )}

          {(industries.length > 0 || customers.length > 0) && (
            <Section icon={Building2} title="Markets served">
              <div className="space-y-4">
                {industries.length > 0 && <ChipList items={industries} />}
                {customers.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Notable customers
                    </p>
                    <ChipList items={customers} />
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Section icon={Building2} title="Company facts">
            <div className="space-y-4">
              <Fact icon={Calendar} label="Established" value={vendor.year_established} />
              <Fact icon={Users} label="Employees" value={vendor.employee_count} />
              <Fact
                icon={Ruler}
                label="Facility size"
                value={sqft ? `${formatNumber(sqft)} sq ft` : null}
              />
              <Fact icon={MapPin} label="Headquarters" value={vendorLocation(vendor)} />
            </div>
          </Section>

          <Section icon={Mail} title="Contact">
            {!session && (vendor.contact_email || vendor.contact_phone) ? (
              <div className="space-y-3">
                {vendor.contact_email && (
                  <p className="flex items-center gap-3 text-sm text-fg-muted">
                    <Mail size={15} />
                    <span className="select-none tracking-wider blur-[3px]">•••••@•••••••.com</span>
                  </p>
                )}
                {vendor.contact_phone && (
                  <p className="flex items-center gap-3 text-sm text-fg-muted">
                    <Phone size={15} />
                    <span className="select-none tracking-wider blur-[3px]">(•••) •••-••••</span>
                  </p>
                )}
                <div className="rounded-xl border border-arc/25 bg-arc/5 p-3.5">
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-secondary">
                    <Lock size={13} className="mt-0.5 shrink-0 text-arc" />
                    Contact details are free with an account.
                  </p>
                  <ButtonLink href="/signup" size="sm" className="mt-2.5 w-full">
                    Create free account
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {vendor.contact_email ? (
                  <a
                    href={`mailto:${vendor.contact_email}`}
                    className="flex items-center gap-3 text-sm text-arc transition-opacity hover:opacity-80"
                  >
                    <Mail size={15} /> {vendor.contact_email}
                  </a>
                ) : null}
                {vendor.contact_phone ? (
                  <a
                    href={`tel:${vendor.contact_phone}`}
                    className="flex items-center gap-3 text-sm text-fg transition-colors hover:text-arc"
                  >
                    <Phone size={15} /> {vendor.contact_phone}
                  </a>
                ) : null}
                {!vendor.contact_email && !vendor.contact_phone && (
                  <p className="text-sm italic text-fg-muted">
                    Direct contacts pending verification
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section icon={Fingerprint} title="Data provenance">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-fg-muted">Discovered via</p>
                <p className="font-mono text-sm text-fg">{vendor.data_source ?? "Multiple sources"}</p>
              </div>
              {provenanceSources.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-fg-muted">Field sources</p>
                  <ChipList items={provenanceSources.slice(0, 6)} />
                </div>
              )}
              <div>
                <p className="text-xs text-fg-muted">Last updated</p>
                <p className="font-mono text-sm text-fg">{vendor.last_updated?.slice(0, 10)}</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Confidence</p>
                <p className="font-mono text-sm capitalize text-fg">
                  {vendor.confidence_level ?? "partial"}
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Similar vendors */}
      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-6 font-display text-xl font-bold text-fg">Similar vendors</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((v) => (
              <VendorCard key={v.id} vendor={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
