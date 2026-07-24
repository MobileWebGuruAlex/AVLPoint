/**
 * Owner-facing profile customization (server-only).
 *
 * - vendor_profiles: LinkedIn-style presentation layer a verified owner
 *   controls (template skin, accent, tagline, about, banner, gallery,
 *   highlights). Pure overlay — pipeline data in `vendors` is untouched,
 *   so pipeline refreshes never clobber owner branding.
 * - inspector_profiles: the same idea for inspection companies.
 * - Claim verification: proof-of-control via a token the claimant places
 *   on the company website (homepage HTML or /avlpoint-verify.txt), which
 *   we fetch and check. Manual admin review remains the fallback.
 */
import crypto from "node:crypto";
import { db } from "./db";
import { logAudit } from "./audit";

/* ================================================================
   Vendor profiles
   ================================================================ */

export const VENDOR_TEMPLATES = ["classic", "bold", "blueprint"] as const;
export type VendorTemplate = (typeof VENDOR_TEMPLATES)[number];

export interface VendorProfile {
  vendor_id: number;
  template: string;
  accent: string | null;
  tagline: string | null;
  about: string | null;
  banner_image: string | null;
  gallery: string;      // JSON string[]
  highlights: string;   // JSON {label, value}[]
  updated_by: string | null;
  updated_at: string;
}

export function getVendorProfile(vendorId: number): VendorProfile | null {
  return (db.prepare("SELECT * FROM vendor_profiles WHERE vendor_id = ?").get(vendorId) as VendorProfile | undefined) ?? null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function upsertVendorProfile(
  vendorId: number,
  input: {
    template?: string;
    accent?: string;
    tagline?: string;
    about?: string;
    bannerImage?: string;
    gallery?: string[];
    highlights?: { label: string; value: string }[];
  },
  actorEmail: string
): void {
  const template = VENDOR_TEMPLATES.includes(input.template as VendorTemplate) ? input.template : "classic";
  const accent = input.accent && HEX_COLOR.test(input.accent) ? input.accent : null;
  const gallery = (input.gallery ?? []).filter((u) => typeof u === "string" && u.startsWith("/uploads/")).slice(0, 8);
  const highlights = (input.highlights ?? [])
    .filter((h) => h && h.label?.trim() && h.value?.trim())
    .slice(0, 6)
    .map((h) => ({ label: h.label.trim().slice(0, 40), value: h.value.trim().slice(0, 80) }));
  const banner = input.bannerImage?.startsWith("/uploads/") ? input.bannerImage : null;

  db.prepare(
    `INSERT INTO vendor_profiles (vendor_id, template, accent, tagline, about, banner_image, gallery, highlights, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(vendor_id) DO UPDATE SET
       template=excluded.template, accent=excluded.accent, tagline=excluded.tagline,
       about=excluded.about, banner_image=excluded.banner_image, gallery=excluded.gallery,
       highlights=excluded.highlights, updated_by=excluded.updated_by, updated_at=datetime('now')`
  ).run(
    vendorId, template, accent,
    input.tagline?.trim().slice(0, 140) || null,
    input.about?.trim().slice(0, 4000) || null,
    banner, JSON.stringify(gallery), JSON.stringify(highlights), actorEmail
  );
}

/* ================================================================
   Inspector profiles
   ================================================================ */

export const INSPECTOR_TEMPLATES = ["field", "precision", "ledger"] as const;
export type InspectorTemplate = (typeof INSPECTOR_TEMPLATES)[number];

export interface InspectorProfile {
  inspector_id: string;
  template: string;
  accent: string | null;
  tagline: string | null;
  bio: string | null;
  photo_image: string | null;
  banner_image: string | null;
  gallery: string;         // JSON string[]
  certifications: string;  // JSON string[]
  service_regions: string; // JSON string[]
  specialties: string;     // JSON string[]
  pricing_note: string | null;
  years_experience: number | null;
  updated_at: string;
}

export function getInspectorProfile(inspectorId: string): InspectorProfile | null {
  return (db.prepare("SELECT * FROM inspector_profiles WHERE inspector_id = ?").get(inspectorId) as InspectorProfile | undefined) ?? null;
}

const cleanList = (arr: unknown, max = 12, maxLen = 80): string[] =>
  (Array.isArray(arr) ? arr : [])
    .map((s) => String(s).trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);

export function upsertInspectorProfile(
  inspectorId: string,
  input: {
    template?: string;
    accent?: string;
    tagline?: string;
    bio?: string;
    photoImage?: string;
    bannerImage?: string;
    gallery?: string[];
    certifications?: string[];
    serviceRegions?: string[];
    specialties?: string[];
    pricingNote?: string;
    yearsExperience?: number;
  }
): void {
  const template = INSPECTOR_TEMPLATES.includes(input.template as InspectorTemplate) ? input.template : "field";
  const accent = input.accent && HEX_COLOR.test(input.accent) ? input.accent : null;
  const img = (u?: string) => (u?.startsWith("/uploads/") ? u : null);

  db.prepare(
    `INSERT INTO inspector_profiles
       (inspector_id, template, accent, tagline, bio, photo_image, banner_image, gallery,
        certifications, service_regions, specialties, pricing_note, years_experience, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(inspector_id) DO UPDATE SET
       template=excluded.template, accent=excluded.accent, tagline=excluded.tagline,
       bio=excluded.bio, photo_image=excluded.photo_image, banner_image=excluded.banner_image,
       gallery=excluded.gallery, certifications=excluded.certifications,
       service_regions=excluded.service_regions, specialties=excluded.specialties,
       pricing_note=excluded.pricing_note, years_experience=excluded.years_experience,
       updated_at=datetime('now')`
  ).run(
    inspectorId, template, accent,
    input.tagline?.trim().slice(0, 140) || null,
    input.bio?.trim().slice(0, 4000) || null,
    img(input.photoImage), img(input.bannerImage),
    JSON.stringify(cleanList(input.gallery, 8, 200).filter((u) => u.startsWith("/uploads/"))),
    JSON.stringify(cleanList(input.certifications)),
    JSON.stringify(cleanList(input.serviceRegions)),
    JSON.stringify(cleanList(input.specialties)),
    input.pricingNote?.trim().slice(0, 140) || null,
    Number.isFinite(input.yearsExperience) && input.yearsExperience! >= 0 && input.yearsExperience! < 80
      ? Math.round(input.yearsExperience!) : null
  );
}

/* ================================================================
   Claim verification via website token
   ================================================================ */

export interface PendingClaim {
  id: string;
  vendor_id: number;
  user_id: string;
  work_email: string;
  status: string;
  verify_token: string | null;
  created_at: string;
}

export function getPendingClaim(vendorId: number, userId: string): PendingClaim | null {
  return (db.prepare(
    "SELECT * FROM vendor_claims WHERE vendor_id = ? AND user_id = ? AND status = 'pending' LIMIT 1"
  ).get(vendorId, userId) as PendingClaim | undefined) ?? null;
}

export function newVerifyToken(): string {
  return `avlpoint-verify-${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Fetch the vendor's website and look for the claim token — first in
 * /avlpoint-verify.txt, then anywhere in the homepage HTML (meta tag,
 * footer, comment — anything works). Finding it proves control of the
 * site, which is stronger evidence than any self-declared email.
 */
export async function checkWebsiteForToken(
  websiteUrl: string,
  token: string
): Promise<{ found: boolean; checked: string[]; error?: string }> {
  const checked: string[] = [];
  let base: URL;
  try {
    base = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    return { found: false, checked, error: "The company website URL on file is invalid." };
  }
  // Never fetch private/internal hosts.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\])/.test(base.hostname)) {
    return { found: false, checked, error: "The website on file points to a private address." };
  }

  const targets = [new URL("/avlpoint-verify.txt", base).href, base.href];
  for (const url of targets) {
    checked.push(url);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "AVLpoint-Verify/1.0 (+https://avlpoint.com/claim)" },
      });
      if (!res.ok) continue;
      const text = (await res.text()).slice(0, 500_000);
      if (text.includes(token)) return { found: true, checked };
    } catch {
      // unreachable target — try the next one
    }
  }
  return { found: false, checked };
}

/** Approve a claim: grant ownership + close the claim. */
export function approveClaim(
  claim: PendingClaim,
  method: "website_token" | "manual",
  actor: { userId: string; email: string }
): void {
  const tx = db.transaction(() => {
    db.prepare("UPDATE vendor_claims SET status = 'approved', verified_at = datetime('now'), verify_method = ? WHERE id = ?")
      .run(method, claim.id);
    db.prepare("INSERT OR IGNORE INTO vendor_owners (vendor_id, user_id) VALUES (?, ?)")
      .run(claim.vendor_id, claim.user_id);
  });
  tx();
  const vendor = db.prepare("SELECT company_name FROM vendors WHERE id = ?").get(claim.vendor_id) as
    { company_name: string } | undefined;
  logAudit({
    actorId: actor.userId, actorEmail: actor.email,
    action: method === "website_token" ? "claim.verified_website" : "claim.approved_manual",
    entityType: "vendor", entityId: claim.vendor_id, entityLabel: vendor?.company_name,
    details: { claim_id: claim.id, work_email: claim.work_email },
  });
}
