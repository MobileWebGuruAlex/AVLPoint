/**
 * AVLpoint vendor data-access layer (server-only).
 *
 * All UI code talks to these functions — never to SQL directly — so the
 * storage engine can be swapped (SQLite today, Supabase/pgvector tomorrow,
 * per .agents/AGENTS.md) without touching a single component.
 *
 * Search uses the existing FTS5 index (`vendors_fts`, 21 fields, bm25
 * ranking) with a LIKE fallback for resilience. If the database file is
 * unavailable entirely, realistic mock data keeps every page rendering.
 */
import { db } from "./db";
import { MOCK_VENDORS, MOCK_STATS } from "./mock-vendors";
import { countryVariants, normalizeCountry } from "./utils";

/** Raw row shape as stored in SQLite (JSON columns are strings). */
export interface VendorRow {
  id: number;
  company_name: string;
  website_url: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  headquarters_location: string | null;
  primary_business_type: string | null;
  company_description: string | null;
  ai_summary: string | null;
  services: string | null;
  capabilities: string | null;
  certifications_held: string | null;
  industries_served: string | null;
  equipment_list: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  year_established: string | null;
  employee_count: string | null;
  facility_size_sqft: string | null;
  logo_url: string | null;
  enterprise_tier: number;
  enterprise_suitability_score: number;
  completeness_status: string | null;
  confidence_level: string | null;
  lifecycle_stage: string | null;
  data_source: string | null;
  last_updated: string;
  // Present on full profile fetches only:
  street_address?: string | null;
  zip_postal_code?: string | null;
  key_personnel?: string | null;
  welding_processes?: string | null;
  fabrication_capabilities?: string | null;
  materials_handled?: string | null;
  memberships?: string | null;
  products?: string | null;
  keywords?: string | null;
  search_tags?: string | null;
  use_cases?: string | null;
  vendor_categories?: string | null;
  project_types?: string | null;
  technical_specialties?: string | null;
  geographic_service_areas?: string | null;
  social_profiles?: string | null;
  notable_customers?: string | null;
  inspection_and_qa_capabilities?: string | null;
  partnerships_and_dealers?: string | null;
  contact_form_url?: string | null;
  data_provenance?: string | null;
  ai_synopsis?: string | null;
}

const SUMMARY_COLS = `id, company_name, website_url, city, state_province, country,
  headquarters_location, primary_business_type, company_description, ai_summary,
  services, capabilities, certifications_held, industries_served, equipment_list,
  contact_email, contact_phone, year_established, employee_count, facility_size_sqft,
  logo_url, enterprise_tier, enterprise_suitability_score, completeness_status,
  confidence_level, lifecycle_stage, data_source, last_updated`;

export interface SearchFilters {
  q?: string;
  country?: string;
  state?: string;
  type?: string;
  tier?: number;
  verified?: boolean;
  cert?: string;
  sort?: "relevance" | "tier" | "name" | "updated";
  page?: number;
}

export interface SearchResult {
  vendors: VendorRow[];
  total: number;
  page: number;
  pageSize: number;
  tookMs: number;
  usedFts: boolean;
}

export interface Facets {
  businessTypes: { value: string; count: number }[];
  countries: { value: string; count: number }[];
  certifications: { value: string; count: number }[];
}

export interface PlatformStats {
  totalVendors: number;
  verifiedVendors: number;
  tier1Vendors: number;
  countries: number;
  sources: number;
  withLogos: number;
}

export const PAGE_SIZE = 12;

/** Turn free text into a safe FTS5 prefix query: `"steel"* "fab"*`. */
function toFtsQuery(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8)
    .map((t) => `"${t}"*`)
    .join(" ");
}

function buildWhere(f: SearchFilters, alias = "v"): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.country) {
    const variants = countryVariants(f.country);
    clauses.push(`${alias}.country IN (${variants.map(() => "?").join(",")})`);
    params.push(...variants);
  }
  if (f.state) {
    clauses.push(`${alias}.state_province = ?`);
    params.push(f.state);
  }
  if (f.type) {
    clauses.push(`${alias}.primary_business_type = ?`);
    params.push(f.type);
  }
  if (f.tier) {
    clauses.push(`${alias}.enterprise_tier = ?`);
    params.push(f.tier);
  }
  if (f.verified) {
    clauses.push(`${alias}.completeness_status = 'verified'`);
  }
  if (f.cert) {
    clauses.push(`${alias}.certifications_held LIKE ?`);
    params.push(`%${f.cert}%`);
  }
  return { clauses, params };
}

function orderBy(sort: SearchFilters["sort"], hasQuery: boolean, usedFts: boolean): string {
  switch (sort) {
    case "tier":
      return "ORDER BY v.enterprise_tier ASC, v.enterprise_suitability_score DESC, v.company_name ASC";
    case "name":
      return "ORDER BY v.company_name COLLATE NOCASE ASC";
    case "updated":
      return "ORDER BY v.last_updated DESC";
    default:
      if (hasQuery && usedFts) {
        // Verified + high-tier vendors float above equally-relevant matches.
        return `ORDER BY (CASE WHEN v.completeness_status='verified' THEN 0 ELSE 1 END) ASC,
                rank ASC, v.enterprise_tier ASC`;
      }
      return `ORDER BY (CASE WHEN v.completeness_status='verified' THEN 0 ELSE 1 END) ASC,
              v.enterprise_tier ASC, v.enterprise_suitability_score DESC, v.last_updated DESC`;
  }
}

export async function searchVendors(filters: SearchFilters): Promise<SearchResult> {
  const started = Date.now();
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const q = filters.q?.trim();

  try {
    const { clauses, params } = buildWhere(filters);

    if (q) {
      const ftsQuery = toFtsQuery(q);
      if (ftsQuery) {
        try {
          const where = ["vendors_fts MATCH ?", ...clauses].join(" AND ");
          const base = `FROM vendors_fts JOIN vendors v ON v.id = vendors_fts.rowid WHERE ${where}`;
          const total = (
            db.prepare(`SELECT count(*) AS n ${base}`).get(ftsQuery, ...params) as { n: number }
          ).n;
          const vendors = db
            .prepare(
              `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")}, bm25(vendors_fts) AS rank
               ${base} ${orderBy(filters.sort, true, true)} LIMIT ? OFFSET ?`
            )
            .all(ftsQuery, ...params, PAGE_SIZE, offset) as VendorRow[];
          return { vendors, total, page, pageSize: PAGE_SIZE, tookMs: Date.now() - started, usedFts: true };
        } catch {
          // FTS index unavailable/corrupt — fall through to LIKE.
        }
      }
      const like = `%${q}%`;
      const likeClause =
        "(v.company_name LIKE ? OR v.company_description LIKE ? OR v.ai_summary LIKE ? OR v.capabilities LIKE ? OR v.services LIKE ?)";
      const where = [likeClause, ...clauses].join(" AND ");
      const likeParams = [like, like, like, like, like, ...params];
      const total = (
        db.prepare(`SELECT count(*) AS n FROM vendors v WHERE ${where}`).get(...likeParams) as { n: number }
      ).n;
      const vendors = db
        .prepare(
          `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")} FROM vendors v WHERE ${where}
           ${orderBy(filters.sort, true, false)} LIMIT ? OFFSET ?`
        )
        .all(...likeParams, PAGE_SIZE, offset) as VendorRow[];
      return { vendors, total, page, pageSize: PAGE_SIZE, tookMs: Date.now() - started, usedFts: false };
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = (
      db.prepare(`SELECT count(*) AS n FROM vendors v ${where}`).get(...params) as { n: number }
    ).n;
    const vendors = db
      .prepare(
        `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")} FROM vendors v ${where}
         ${orderBy(filters.sort, false, false)} LIMIT ? OFFSET ?`
      )
      .all(...params, PAGE_SIZE, offset) as VendorRow[];
    return { vendors, total, page, pageSize: PAGE_SIZE, tookMs: Date.now() - started, usedFts: false };
  } catch {
    // Database unavailable — mock fallback keeps the UI alive.
    const ql = q?.toLowerCase();
    const matched = MOCK_VENDORS.filter(
      (v) =>
        !ql ||
        v.company_name.toLowerCase().includes(ql) ||
        (v.ai_summary ?? "").toLowerCase().includes(ql) ||
        (v.primary_business_type ?? "").toLowerCase().includes(ql)
    );
    return {
      vendors: matched.slice(offset, offset + PAGE_SIZE),
      total: matched.length,
      page,
      pageSize: PAGE_SIZE,
      tookMs: Date.now() - started,
      usedFts: false,
    };
  }
}

export async function getVendorById(id: number): Promise<VendorRow | null> {
  try {
    const row = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id) as VendorRow | undefined;
    return row ?? null;
  } catch {
    return MOCK_VENDORS.find((v) => v.id === id) ?? null;
  }
}

export async function getSimilarVendors(vendor: VendorRow, limit = 4): Promise<VendorRow[]> {
  try {
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS} FROM vendors
         WHERE id != ? AND primary_business_type = ?
         ORDER BY (CASE WHEN completeness_status='verified' THEN 0 ELSE 1 END) ASC,
                  enterprise_tier ASC, enterprise_suitability_score DESC
         LIMIT ?`
      )
      .all(vendor.id, vendor.primary_business_type, limit) as VendorRow[];
  } catch {
    return MOCK_VENDORS.filter((v) => v.id !== vendor.id).slice(0, limit);
  }
}

export async function getFeaturedVendors(limit = 6): Promise<VendorRow[]> {
  try {
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS} FROM vendors
         WHERE completeness_status = 'verified' AND ai_summary IS NOT NULL AND ai_summary != ''
         ORDER BY enterprise_tier ASC, enterprise_suitability_score DESC, last_updated DESC
         LIMIT ?`
      )
      .all(limit) as VendorRow[];
  } catch {
    return MOCK_VENDORS.slice(0, limit);
  }
}

let statsCache: { at: number; value: PlatformStats } | null = null;

export async function getStats(): Promise<PlatformStats> {
  if (statsCache && Date.now() - statsCache.at < 60_000) return statsCache.value;
  try {
    const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const value: PlatformStats = {
      totalVendors: one("SELECT count(*) AS n FROM vendors"),
      verifiedVendors: one("SELECT count(*) AS n FROM vendors WHERE completeness_status='verified'"),
      tier1Vendors: one("SELECT count(*) AS n FROM vendors WHERE enterprise_tier=1"),
      countries: one(
        "SELECT count(DISTINCT lower(country)) AS n FROM vendors WHERE country IS NOT NULL AND country != ''"
      ),
      sources: 14,
      withLogos: one(
        "SELECT count(*) AS n FROM vendors WHERE logo_url IS NOT NULL OR logo_local_path IS NOT NULL"
      ),
    };
    statsCache = { at: Date.now(), value };
    return value;
  } catch {
    return MOCK_STATS;
  }
}

let facetsCache: { at: number; value: Facets } | null = null;

export async function getFacets(): Promise<Facets> {
  if (facetsCache && Date.now() - facetsCache.at < 300_000) return facetsCache.value;
  try {
    const businessTypes = (
      db
        .prepare(
          `SELECT primary_business_type AS value, count(*) AS count FROM vendors
           WHERE primary_business_type IS NOT NULL AND primary_business_type != ''
           GROUP BY primary_business_type ORDER BY count DESC LIMIT 18`
        )
        .all() as { value: string; count: number }[]
    ).filter((r) => r.value.length < 48);

    const rawCountries = db
      .prepare(
        `SELECT country AS value, count(*) AS count FROM vendors
         WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC LIMIT 40`
      )
      .all() as { value: string; count: number }[];
    const merged = new Map<string, number>();
    for (const r of rawCountries) {
      const norm = normalizeCountry(r.value);
      if (!norm) continue;
      merged.set(norm, (merged.get(norm) ?? 0) + r.count);
    }
    const countries = [...merged.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 16);

    // Common certification families searched by procurement teams.
    const CERT_FAMILIES = ["ISO 9001", "AWS", "ASME", "AISC", "AS9100", "ITAR", "NADCAP", "CE"];
    const certifications = CERT_FAMILIES.map((c) => ({
      value: c,
      count: (
        db
          .prepare("SELECT count(*) AS n FROM vendors WHERE certifications_held LIKE ?")
          .get(`%${c}%`) as { n: number }
      ).n,
    })).filter((c) => c.count > 0);

    const value = { businessTypes, countries, certifications };
    facetsCache = { at: Date.now(), value };
    return value;
  } catch {
    return {
      businessTypes: [
        { value: "Manufacturer/Fabricator", count: 20617 },
        { value: "Metal Products Manufacturer", count: 2089 },
        { value: "Structural Metal Fabricator", count: 1435 },
        { value: "Sheet Metal Fabricator", count: 804 },
        { value: "Pressure Vessel / Boiler Manufacturer", count: 662 },
      ],
      countries: [
        { value: "United States", count: 13791 },
        { value: "Italy", count: 7353 },
        { value: "United Kingdom", count: 3513 },
        { value: "Spain", count: 3374 },
      ],
      certifications: [
        { value: "ISO 9001", count: 3120 },
        { value: "AWS", count: 2214 },
        { value: "ASME", count: 980 },
      ],
    };
  }
}

/* ---------------- Saved vendors (shortlists) ---------------- */

function ensureSavedTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_vendors (
    user_id TEXT NOT NULL,
    vendor_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, vendor_id)
  )`);
}

export async function getSavedVendors(userId: string): Promise<VendorRow[]> {
  try {
    ensureSavedTable();
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")}
         FROM saved_vendors s JOIN vendors v ON v.id = s.vendor_id
         WHERE s.user_id = ? ORDER BY s.created_at DESC`
      )
      .all(userId) as VendorRow[];
  } catch {
    return [];
  }
}

export async function getSavedIds(userId: string): Promise<Set<number>> {
  try {
    ensureSavedTable();
    const rows = db.prepare("SELECT vendor_id FROM saved_vendors WHERE user_id = ?").all(userId) as {
      vendor_id: number;
    }[];
    return new Set(rows.map((r) => r.vendor_id));
  } catch {
    return new Set();
  }
}

export async function setSaved(userId: string, vendorId: number, saved: boolean): Promise<void> {
  ensureSavedTable();
  if (saved) {
    db.prepare("INSERT OR IGNORE INTO saved_vendors (user_id, vendor_id) VALUES (?, ?)").run(
      userId,
      vendorId
    );
  } else {
    db.prepare("DELETE FROM saved_vendors WHERE user_id = ? AND vendor_id = ?").run(userId, vendorId);
  }
}
