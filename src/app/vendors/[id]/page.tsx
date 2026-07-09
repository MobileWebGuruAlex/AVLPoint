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
import { jsonList, jsonObject, vendorLocation, hostname, formatNumber } from "@/lib/utils";
import { ButtonLink } from "@/components/ui";
import { VendorCard, VendorLogo, TierBadge, TrustBadge } from "@/components/vendor-card";
import { SaveButton } from "@/components/save-button";
import { BadgeCheck, Lock } from "lucide-react";

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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
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
                <TrustBadge vendor={vendor} />
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          <Section icon={Sparkles} title="AI capability summary">
            {vendor.ai_summary || vendor.company_description ? (
              <p className="text-[15px] leading-relaxed text-fg-secondary">
                {vendor.ai_summary ?? vendor.company_description}
              </p>
            ) : (
              <p className="text-sm italic text-fg-muted">
                This profile is queued for AI enrichment. Core facts below come from source
                registries.
              </p>
            )}
            {vendor.ai_synopsis && vendor.ai_synopsis !== vendor.ai_summary && (
              <p className="mt-3 border-l-2 border-arc/40 pl-3 font-mono text-xs leading-relaxed text-fg-muted">
                {vendor.ai_synopsis}
              </p>
            )}
          </Section>

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
            {/* Access tier T0: contact details are gated behind a free,
                terms-bound account — the real wall is server-side (values
                are never rendered for anonymous visitors). */}
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
