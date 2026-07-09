import Link from "next/link";
import { MapPin, Globe, ShieldCheck } from "lucide-react";
import type { VendorRow } from "@/lib/vendors";
import { jsonList, vendorLocation, hostname, truncate } from "@/lib/utils";
import { Badge } from "./ui";

export function TierBadge({ tier }: { tier: number }) {
  if (tier === 1) return <Badge tone="arc">Tier 1 · Enterprise</Badge>;
  if (tier === 2) return <Badge tone="neutral">Tier 2 · Established</Badge>;
  return <Badge tone="neutral">Tier 3</Badge>;
}

/**
 * Trust Ladder badge — Listed → Claimed → Verified → Level 1 Certified.
 * Brand rule: green is reserved for independent certification only;
 * Verified renders in arc blue.
 */
export function TrustBadge({ vendor }: { vendor: VendorRow }) {
  if (vendor.completeness_status === "certified")
    return (
      <Badge tone="ok">
        <ShieldCheck size={11} /> Level 1 Certified
      </Badge>
    );
  if (vendor.completeness_status === "verified")
    return (
      <Badge tone="arc">
        <ShieldCheck size={11} /> Verified
      </Badge>
    );
  if (vendor.lifecycle_stage === "claimed") return <Badge tone="arc">Claimed</Badge>;
  return <Badge tone="neutral">Listed</Badge>;
}

export function VendorLogo({ vendor, size = 48 }: { vendor: VendorRow; size?: number }) {
  const initials = vendor.company_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 font-display font-bold text-fg-secondary"
      aria-hidden="true"
    >
      {vendor.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote vendor logos, arbitrary hosts
        <img
          src={vendor.logo_url}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        <span style={{ fontSize: size * 0.34 }}>{initials}</span>
      )}
    </div>
  );
}

export function VendorCard({ vendor }: { vendor: VendorRow }) {
  const summary = vendor.ai_summary ?? vendor.company_description;
  const caps = [...jsonList(vendor.capabilities), ...jsonList(vendor.services)].slice(0, 3);
  const certs = jsonList(vendor.certifications_held).slice(0, 3);
  const host = hostname(vendor.website_url);

  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="card card-hover group flex flex-col gap-4 p-5"
    >
      <div className="flex items-start gap-3.5">
        <VendorLogo vendor={vendor} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold text-fg transition-colors group-hover:text-arc">
            {vendor.company_name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-fg-secondary">
            <MapPin size={13} className="shrink-0 text-fg-muted" />
            {vendorLocation(vendor)}
          </p>
        </div>
        {vendor.completeness_status === "verified" && (
          <span title="Verified profile" className="text-arc">
            <ShieldCheck size={18} />
          </span>
        )}
      </div>

      {summary ? (
        <p className="text-sm leading-relaxed text-fg-secondary">{truncate(summary, 150)}</p>
      ) : (
        <p className="text-sm italic text-fg-muted">
          {vendor.primary_business_type ?? "Industrial vendor"} — enrichment in progress
        </p>
      )}

      {(caps.length > 0 || certs.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {certs.map((c) => (
            <span key={c} className="chip !border-arc/25 !text-arc">
              {truncate(c, 26)}
            </span>
          ))}
          {caps.map((c) => (
            <span key={c} className="chip">
              {truncate(c, 26)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <TrustBadge vendor={vendor} />
          <TierBadge tier={vendor.enterprise_tier} />
        </span>
        {host && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-fg-muted">
            <Globe size={12} />
            {host}
          </span>
        )}
      </div>
    </Link>
  );
}

export function VendorCardSkeleton() {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3.5">
        <div className="skeleton h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
      </div>
      <div className="flex gap-1.5">
        <div className="skeleton h-6 w-20 rounded-full" />
        <div className="skeleton h-6 w-24 rounded-full" />
      </div>
      <div className="skeleton mt-1 h-5 w-28 rounded-full" />
    </div>
  );
}
