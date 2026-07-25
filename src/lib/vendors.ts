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
import { awakeSql } from "./states";

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
  /** Geographic scope. Default "us": US-only. "intl": non-US only. "all": worldwide. */
  scope?: "us" | "intl" | "all";
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

/** Filler words that natural-language queries carry but no vendor record
 *  contains ("I need to ask my certified vessel builder in Texas" must
 *  search for certified/vessel/builder/Texas, not "ask" and "my"). */
const STOPWORDS = new Set([
  "i", "a", "an", "the", "my", "our", "your", "me", "we", "us", "it",
  "to", "in", "on", "at", "of", "for", "with", "from", "by", "near",
  "and", "or", "but", "so", "if", "then", "than", "that", "this", "these",
  "is", "are", "was", "be", "been", "do", "does", "did", "can", "could",
  "will", "would", "should", "need", "needs", "want", "wants", "looking",
  "look", "find", "get", "ask", "help", "please", "who", "what", "where",
  "which", "how", "someone", "some", "any", "best", "good", "top",
]);

/** Turn free text into a safe FTS5 prefix query: `"steel"* "fab"*`.
 *  Pass andJoin=false to OR the terms — the zero-result fallback.
 *  Shared by every search surface (public, admin, chat KB) — natural-language
 *  handling must behave identically site-wide. */
export function toFtsQuery(q: string, andJoin = true): string {
  const terms = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t.toLowerCase()))
    .slice(0, 8)
    .map((t) => `"${t}"*`);
  return terms.join(andJoin ? " " : " OR ");
}

function buildWhere(f: SearchFilters, alias = "v"): { clauses: string[]; params: unknown[] } {
  // Sleeping vendors are invisible to every user-facing query.
  const clauses: string[] = [awakeSql(alias)];
  const params: unknown[] = [];
  if (f.country) {
    const variants = countryVariants(f.country);
    clauses.push(`${alias}.country IN (${variants.map(() => "?").join(",")})`);
    params.push(...variants);
  } else {
    // Geographic default: US-only. International shown only when explicitly
    // requested (scope="intl" or "all"). This is the single choke point — every
    // caller (search, API, recommend, chatbot) inherits it.
    const scope = f.scope ?? "us";
    const usVariants = countryVariants("United States");
    if (scope === "us") {
      clauses.push(`${alias}.country IN (${usVariants.map(() => "?").join(",")})`);
      params.push(...usVariants);
    } else if (scope === "intl") {
      clauses.push(
        `(${alias}.country IS NOT NULL AND ${alias}.country != '' AND ${alias}.country NOT IN (${usVariants.map(() => "?").join(",")}))`
      );
      params.push(...usVariants);
    }
    // scope === "all": no geographic clause.
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
      const strict = toFtsQuery(q);
      if (strict) {
        try {
          const where = ["vendors_fts MATCH ?", ...clauses].join(" AND ");
          const base = `FROM vendors_fts JOIN vendors v ON v.id = vendors_fts.rowid WHERE ${where}`;
          const runFts = (ftsQuery: string) => {
            const total = (
              db.prepare(`SELECT count(*) AS n ${base}`).get(ftsQuery, ...params) as { n: number }
            ).n;
            const vendors = db
              .prepare(
                `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")}, bm25(vendors_fts) AS rank
                 ${base} ${orderBy(filters.sort, true, true)} LIMIT ? OFFSET ?`
              )
              .all(ftsQuery, ...params, PAGE_SIZE, offset) as VendorRow[];
            return { vendors, total };
          };
          let hit = runFts(strict);
          if (hit.total === 0) {
            // Not every meaningful word matches ("certified vessel builder
            // Texas" — no record says "builder"). Relax to OR: any term,
            // bm25 still ranks the best overlap first.
            const loose = toFtsQuery(q, false);
            if (loose.includes(" OR ")) hit = runFts(loose);
          }
          return {
            vendors: hit.vendors, total: hit.total, page, pageSize: PAGE_SIZE,
            tookMs: Date.now() - started, usedFts: true,
          };
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

/** Public profile fetch — returns null for sleeping vendors (page 404s). */
export async function getVendorById(id: number): Promise<VendorRow | null> {
  try {
    const row = db
      .prepare(`SELECT * FROM vendors v WHERE v.id = ? AND ${awakeSql()}`)
      .get(id) as VendorRow | undefined;
    return row ?? null;
  } catch {
    return MOCK_VENDORS.find((v) => v.id === id) ?? null;
  }
}

export async function getSimilarVendors(vendor: VendorRow, limit = 4): Promise<VendorRow[]> {
  try {
    return db
      .prepare(
        `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")} FROM vendors v
         WHERE v.id != ? AND v.primary_business_type = ? AND ${awakeSql()}
         ORDER BY (CASE WHEN v.completeness_status='verified' THEN 0 ELSE 1 END) ASC,
                  v.enterprise_tier ASC, v.enterprise_suitability_score DESC
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
        `SELECT ${SUMMARY_COLS.replace(/(^|,\s*)(\w+)/g, "$1v.$2")} FROM vendors v
         WHERE v.completeness_status = 'verified' AND v.ai_summary IS NOT NULL AND v.ai_summary != ''
           AND ${awakeSql()}
         ORDER BY v.enterprise_tier ASC, v.enterprise_suitability_score DESC, v.last_updated DESC
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
    const awake = awakeSql();
    const value: PlatformStats = {
      totalVendors: one(`SELECT count(*) AS n FROM vendors v WHERE ${awake}`),
      verifiedVendors: one(`SELECT count(*) AS n FROM vendors v WHERE v.completeness_status='verified' AND ${awake}`),
      tier1Vendors: one(`SELECT count(*) AS n FROM vendors v WHERE v.enterprise_tier=1 AND ${awake}`),
      countries: one(
        `SELECT count(DISTINCT lower(v.country)) AS n FROM vendors v WHERE v.country IS NOT NULL AND v.country != '' AND ${awake}`
      ),
      sources: 14,
      withLogos: one(
        `SELECT count(*) AS n FROM vendors v WHERE (v.logo_url IS NOT NULL OR v.logo_local_path IS NOT NULL) AND ${awake}`
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
    const awake = awakeSql();
    const businessTypes = (
      db
        .prepare(
          `SELECT v.primary_business_type AS value, count(*) AS count FROM vendors v
           WHERE v.primary_business_type IS NOT NULL AND v.primary_business_type != '' AND ${awake}
           GROUP BY v.primary_business_type ORDER BY count DESC LIMIT 18`
        )
        .all() as { value: string; count: number }[]
    ).filter((r) => r.value.length < 48);

    const rawCountries = db
      .prepare(
        `SELECT v.country AS value, count(*) AS count FROM vendors v
         WHERE v.country IS NOT NULL AND v.country != '' AND ${awake} GROUP BY v.country ORDER BY count DESC LIMIT 40`
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
          .prepare(`SELECT count(*) AS n FROM vendors v WHERE v.certifications_held LIKE ? AND ${awake}`)
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
         WHERE s.user_id = ? AND ${awakeSql()} ORDER BY s.created_at DESC`
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
