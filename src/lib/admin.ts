/**
 * Admin data-access layer (server-only).
 *
 * Manages all admin portal queries and mutations against the vendors table,
 * the admin_actions audit log, and related supporting tables.
 *
 * All writes are logged for accountability. Bulk operations use transactions
 * for atomicity. Never modifies the vendors table schema (pipeline contract).
 */
import { db } from "./db";
import { logAudit } from "./audit";
import { awakeSql } from "./states";
import { toFtsQuery } from "./vendors";

/* ================================================================
   Bootstrap: ensure admin tables + performance indexes exist
   ================================================================ */

let adminReady = false;

export function ensureAdminTables() {
  if (adminReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_actions (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_vendor_id INTEGER,
      target_vendor_name TEXT,
      details TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_date ON admin_actions(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_vendor ON admin_actions(target_vendor_id);
  `);

  // Performance indexes for admin filter queries (idempotent)
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_vendors_tier_lifecycle ON vendors(enterprise_tier, lifecycle_stage)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_lifecycle_priority ON vendors(lifecycle_stage, dynamic_priority_score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_completeness_tier ON vendors(completeness_status, enterprise_tier)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_source ON vendors(data_source)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_confidence ON vendors(confidence_level)",
  ];
  for (const sql of indexes) {
    try { db.exec(sql); } catch { /* index may already exist */ }
  }

  adminReady = true;
}

/* ================================================================
   Types
   ================================================================ */

/** Full vendor row — all columns from SELECT * */
export interface VendorFullRow {
  id: number;
  company_name: string;
  website_url: string | null;
  headquarters_location: string | null;
  facility_size_sqft: string | null;
  certifications_held: string | null;
  primary_business_type: string | null;
  materials_handled: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  key_personnel: string | null;
  year_established: string | null;
  thomasnet_profile_url: string | null;
  data_source: string | null;
  completeness_status: string | null;
  confidence_level: string | null;
  data_provenance: string | null;
  last_updated: string;
  logo_url: string | null;
  logo_local_path: string | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  zip_postal_code: string | null;
  company_description: string | null;
  services: string | null;
  capabilities: string | null;
  welding_processes: string | null;
  fabrication_capabilities: string | null;
  industries_served: string | null;
  memberships: string | null;
  equipment_list: string | null;
  shop_capacity: string | null;
  employee_count: string | null;
  geographic_service_areas: string | null;
  social_profiles: string | null;
  images: string | null;
  contact_form_url: string | null;
  license_numbers: string | null;
  registration_numbers: string | null;
  language_needs_approval: number;
  enterprise_suitability_score: number;
  enterprise_rationale: string | null;
  dynamic_priority_score: number;
  alternate_names: string | null;
  sub_industries: string | null;
  products: string | null;
  additional_locations: string | null;
  keywords: string | null;
  search_tags: string | null;
  ai_summary: string | null;
  use_cases: string | null;
  vendor_categories: string | null;
  project_types: string | null;
  technical_specialties: string | null;
  partnerships_and_dealers: string | null;
  ai_synopsis: string | null;
  representative_images: string | null;
  itar_registered: number;
  cage_code: string | null;
  duns_number: string | null;
  iso_9001: number;
  as9100: number;
  cybersecurity_compliance: string | null;
  annual_revenue_estimate: string | null;
  lead_times: string | null;
  enrichment_attempts: number;
  lifecycle_stage: string | null;
  enterprise_tier: number;
  // AI blob columns
  identity_data: string | null;
  business_data: string | null;
  capabilities_data: string | null;
  certifications_data: string | null;
  relationships_data: string | null;
  products_data: string | null;
  experience_data: string | null;
  geographic_data: string | null;
  business_info_data: string | null;
  digital_presence_data: string | null;
  brand_assets_data: string | null;
  reputation_data: string | null;
  ai_metadata_data: string | null;
  inspection_and_qa_capabilities: string | null;
  notable_customers: string | null;
  /** Computed in admin queries: 1 when a 'sleeping' overlay row exists. */
  sleeping?: number;
}

export interface AdminFilters {
  q?: string;
  tier?: number;
  lifecycle?: string;
  completeness?: string;
  confidence?: string;
  country?: string;
  state?: string;
  businessType?: string;
  dataSource?: string;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  /** Sleep overlay filter: "awake" | "sleeping" (omit = both). */
  sleepState?: string;
  page?: number;
  pageSize?: number;
  sort?: "name" | "tier" | "score" | "updated" | "priority";
  sortDir?: "asc" | "desc";
}

export interface AdminSearchResult {
  vendors: VendorFullRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminAction {
  id: string;
  admin_user_id: string;
  admin_email: string;
  action_type: string;
  target_vendor_id: number | null;
  target_vendor_name: string | null;
  details: string;
  created_at: string;
}

export interface AdminStats {
  total: number;
  byTier: { tier: number; count: number }[];
  byLifecycle: { stage: string; count: number }[];
  byCompleteness: { status: string; count: number }[];
  byConfidence: { level: string; count: number }[];
  topCountries: { country: string; count: number }[];
  topBusinessTypes: { type: string; count: number }[];
  withWebsite: number;
  withEmail: number;
  withPhone: number;
  sleeping: number;
}

/* ================================================================
   Audit logging
   ================================================================ */

/** Vendor-shaped convenience wrapper over the canonical audit logger. */
export function logAdminAction(params: {
  adminUserId: string;
  adminEmail: string;
  actionType: string;
  targetVendorId?: number | null;
  targetVendorName?: string | null;
  details?: Record<string, unknown>;
}) {
  ensureAdminTables();
  logAudit({
    actorId: params.adminUserId,
    actorEmail: params.adminEmail,
    action: params.actionType,
    entityType: "vendor",
    entityId: params.targetVendorId ?? null,
    entityLabel: params.targetVendorName ?? null,
    details: params.details,
  });
}

export function getAdminActions(
  page: number = 1,
  pageSize: number = 30,
  actionType?: string
): { actions: AdminAction[]; total: number } {
  ensureAdminTables();
  const where = actionType ? "WHERE action_type = ?" : "";
  const params: unknown[] = actionType ? [actionType] : [];
  const total = (
    db.prepare(`SELECT count(*) AS n FROM admin_actions ${where}`).get(...params) as { n: number }
  ).n;
  const offset = (Math.max(1, page) - 1) * pageSize;
  const actions = db
    .prepare(
      `SELECT * FROM admin_actions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as AdminAction[];
  return { actions, total };
}

/* ================================================================
   Vendor search & browse (admin-grade, returns all columns)
   ================================================================ */

const SUMMARY_ADMIN = `id, company_name, website_url, city, state_province, country,
  headquarters_location, primary_business_type, company_description,
  contact_email, contact_phone, enterprise_tier, enterprise_suitability_score,
  completeness_status, confidence_level, lifecycle_stage, data_source,
  dynamic_priority_score, last_updated, keywords, certifications_held, ai_summary`;

const SLEEPING_SQL =
  "EXISTS (SELECT 1 FROM vendor_states vst WHERE vst.vendor_id = v.id AND vst.state = 'sleeping')";

/** Computed column exposing the sleep overlay in admin lists. */
const SLEEPING_COL = `${SLEEPING_SQL} AS sleeping`;

// FTS query building lives in vendors.ts (shared site-wide semantics).

export function adminSearchVendors(filters: AdminFilters): AdminSearchResult {
  ensureAdminTables();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const clauses: string[] = [];
  const params: unknown[] = [];

  // Filters
  if (filters.tier !== undefined && filters.tier !== null) {
    clauses.push("v.enterprise_tier = ?");
    params.push(filters.tier);
  }
  if (filters.lifecycle) {
    clauses.push("v.lifecycle_stage = ?");
    params.push(filters.lifecycle);
  }
  if (filters.completeness) {
    clauses.push("v.completeness_status = ?");
    params.push(filters.completeness);
  }
  if (filters.confidence) {
    clauses.push("v.confidence_level = ?");
    params.push(filters.confidence);
  }
  if (filters.country) {
    clauses.push("v.country = ?");
    params.push(filters.country);
  }
  if (filters.state) {
    clauses.push("v.state_province = ?");
    params.push(filters.state);
  }
  if (filters.businessType) {
    clauses.push("v.primary_business_type = ?");
    params.push(filters.businessType);
  }
  if (filters.dataSource) {
    clauses.push("v.data_source LIKE ?");
    params.push(`%${filters.dataSource}%`);
  }
  if (filters.hasWebsite === true) {
    clauses.push("v.website_url IS NOT NULL AND v.website_url != ''");
  } else if (filters.hasWebsite === false) {
    clauses.push("(v.website_url IS NULL OR v.website_url = '')");
  }
  if (filters.hasEmail === true) {
    clauses.push("v.contact_email IS NOT NULL AND v.contact_email != ''");
  } else if (filters.hasEmail === false) {
    clauses.push("(v.contact_email IS NULL OR v.contact_email = '')");
  }
  if (filters.sleepState === "sleeping") {
    clauses.push(SLEEPING_SQL);
  } else if (filters.sleepState === "awake") {
    clauses.push(awakeSql("v"));
  }

  const q = filters.q?.trim();

  // Sort
  let orderClause: string;
  const dir = filters.sortDir === "asc" ? "ASC" : "DESC";
  switch (filters.sort) {
    case "name":
      orderClause = `ORDER BY v.company_name COLLATE NOCASE ${dir}`;
      break;
    case "tier":
      orderClause = `ORDER BY v.enterprise_tier ${dir}, v.enterprise_suitability_score DESC`;
      break;
    case "score":
      orderClause = `ORDER BY v.enterprise_suitability_score ${dir}`;
      break;
    case "priority":
      orderClause = `ORDER BY v.dynamic_priority_score ${dir}`;
      break;
    case "updated":
    default:
      orderClause = `ORDER BY v.last_updated ${dir}`;
      break;
  }

  // Text search path
  if (q) {
    const strict = toFtsQuery(q);
    if (strict) {
      try {
        const ftsWhere = ["vendors_fts MATCH ?", ...clauses].join(" AND ");
        const base = `FROM vendors_fts JOIN vendors v ON v.id = vendors_fts.rowid WHERE ${ftsWhere}`;
        const cols = SUMMARY_ADMIN.replace(/(^|,\s*)(\w+)/g, "$1v.$2");
        const runFts = (ftsQuery: string) => {
          const total = (
            db.prepare(`SELECT count(*) AS n ${base}`).get(ftsQuery, ...params) as { n: number }
          ).n;
          const vendors = db
            .prepare(`SELECT ${cols}, ${SLEEPING_COL}, bm25(vendors_fts) AS rank ${base} ${orderClause} LIMIT ? OFFSET ?`)
            .all(ftsQuery, ...params, pageSize, offset) as VendorFullRow[];
          return { vendors, total };
        };
        let hit = runFts(strict);
        if (hit.total === 0) {
          // Same natural-language relaxation as the public search.
          const loose = toFtsQuery(q, false);
          if (loose.includes(" OR ")) hit = runFts(loose);
        }
        return { vendors: hit.vendors, total: hit.total, page, pageSize };
      } catch {
        // FTS unavailable — fall through to LIKE
      }
    }

    // LIKE fallback
    const like = `%${q}%`;
    clauses.push(
      "(v.company_name LIKE ? OR v.company_description LIKE ? OR v.ai_summary LIKE ? OR v.capabilities LIKE ? OR v.services LIKE ? OR v.keywords LIKE ?)"
    );
    params.push(like, like, like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT count(*) AS n FROM vendors v ${where}`).get(...params) as { n: number }
  ).n;
  const cols = SUMMARY_ADMIN.replace(/(^|,\s*)(\w+)/g, "$1v.$2");
  const vendors = db
    .prepare(`SELECT ${cols}, ${SLEEPING_COL} FROM vendors v ${where} ${orderClause} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as VendorFullRow[];

  return { vendors, total, page, pageSize };
}

/* ================================================================
   Vendor CRUD
   ================================================================ */

export function getVendorFull(id: number): VendorFullRow | null {
  ensureAdminTables();
  return (db.prepare("SELECT * FROM vendors WHERE id = ?").get(id) as VendorFullRow | undefined) ?? null;
}

/** Allowed scalar fields that can be directly updated */
const EDITABLE_SCALARS = new Set([
  "company_name", "website_url", "headquarters_location", "facility_size_sqft",
  "primary_business_type", "contact_email", "contact_phone", "contact_form_url",
  "year_established", "thomasnet_profile_url", "logo_url", "logo_local_path",
  "street_address", "city", "state_province", "country", "zip_postal_code",
  "company_description", "shop_capacity", "employee_count", "ai_summary",
  "ai_synopsis", "enterprise_suitability_score", "enterprise_rationale",
  "dynamic_priority_score", "completeness_status", "confidence_level",
  "lifecycle_stage", "enterprise_tier", "annual_revenue_estimate", "lead_times",
  "cage_code", "duns_number", "cybersecurity_compliance", "data_source",
  "social_profiles",
]);

/** Allowed JSON array fields that can be replaced wholesale */
const EDITABLE_ARRAYS = new Set([
  "keywords", "search_tags", "vendor_categories", "use_cases",
  "project_types", "technical_specialties", "sub_industries",
  "services", "capabilities", "welding_processes", "fabrication_capabilities",
  "industries_served", "certifications_held", "equipment_list",
  "materials_handled", "memberships", "products", "alternate_names",
  "geographic_service_areas", "notable_customers", "partnerships_and_dealers",
  "inspection_and_qa_capabilities", "license_numbers", "registration_numbers",
  "images", "representative_images", "additional_locations", "key_personnel",
]);

/** Allowed boolean/integer fields */
const EDITABLE_BOOLEANS = new Set([
  "itar_registered", "iso_9001", "as9100", "language_needs_approval",
]);

export function updateVendor(
  id: number,
  changes: Record<string, unknown>,
  admin: { userId: string; email: string }
): { success: boolean; error?: string } {
  ensureAdminTables();

  const vendor = db.prepare("SELECT id, company_name FROM vendors WHERE id = ?").get(id) as
    { id: number; company_name: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  const changedFields: Record<string, { old?: unknown; new: unknown }> = {};

  for (const [key, val] of Object.entries(changes)) {
    if (EDITABLE_SCALARS.has(key)) {
      setClauses.push(`${key} = ?`);
      values.push(val ?? null);
      changedFields[key] = { new: val };
    } else if (EDITABLE_ARRAYS.has(key)) {
      const arr = Array.isArray(val) ? val : [];
      setClauses.push(`${key} = ?`);
      values.push(JSON.stringify(arr));
      changedFields[key] = { new: arr };
    } else if (EDITABLE_BOOLEANS.has(key)) {
      setClauses.push(`${key} = ?`);
      values.push(val ? 1 : 0);
      changedFields[key] = { new: val };
    }
    // silently ignore unrecognized keys
  }

  if (setClauses.length === 0) return { success: false, error: "No valid fields to update." };

  setClauses.push("last_updated = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE vendors SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "edit",
    targetVendorId: id,
    targetVendorName: vendor.company_name,
    details: { fields: changedFields },
  });

  return { success: true };
}

export function deleteVendor(
  id: number,
  admin: { userId: string; email: string }
): { success: boolean; error?: string } {
  ensureAdminTables();

  const vendor = db.prepare("SELECT id, company_name FROM vendors WHERE id = ?").get(id) as
    { id: number; company_name: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  // Log before deleting
  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "delete",
    targetVendorId: id,
    targetVendorName: vendor.company_name,
    details: { hard_delete: true },
  });

  const tx = db.transaction(() => {
    // Clean up related records
    try { db.prepare("DELETE FROM saved_vendors WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    try { db.prepare("DELETE FROM vendor_claims WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    try { db.prepare("DELETE FROM vendor_owners WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    try { db.prepare("DELETE FROM vendor_enrichments WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    try { db.prepare("DELETE FROM vendor_states WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    try { db.prepare("DELETE FROM site_certifications WHERE vendor_id = ?").run(id); } catch { /* table may not exist */ }
    // Delete vendor (FTS trigger handles fts cleanup)
    db.prepare("DELETE FROM vendors WHERE id = ?").run(id);
  });
  tx();

  return { success: true };
}

/* ================================================================
   Approval workflow
   ================================================================ */

export function setLifecycleStage(
  id: number,
  stage: string,
  admin: { userId: string; email: string }
): { success: boolean; error?: string } {
  ensureAdminTables();
  const validStages = ["discovered", "enriched", "fully_built", "locked", "disqualified"];
  if (!validStages.includes(stage)) return { success: false, error: `Invalid stage: ${stage}` };

  const vendor = db.prepare("SELECT id, company_name, lifecycle_stage FROM vendors WHERE id = ?").get(id) as
    { id: number; company_name: string; lifecycle_stage: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  db.prepare("UPDATE vendors SET lifecycle_stage = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?")
    .run(stage, id);

  const actionType = stage === "locked" ? "approve" : stage === "disqualified" ? "reject" : "edit";
  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType,
    targetVendorId: id,
    targetVendorName: vendor.company_name,
    details: { from: vendor.lifecycle_stage, to: stage },
  });

  return { success: true };
}

export function bulkSetLifecycleStage(
  ids: number[],
  stage: string,
  admin: { userId: string; email: string }
): number {
  ensureAdminTables();
  const validStages = ["discovered", "enriched", "fully_built", "locked", "disqualified"];
  if (!validStages.includes(stage)) return 0;

  let affected = 0;
  const actionType = stage === "locked" ? "bulk_approve" : stage === "disqualified" ? "bulk_reject" : "bulk_edit";

  const tx = db.transaction(() => {
    const stmt = db.prepare(
      "UPDATE vendors SET lifecycle_stage = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?"
    );
    for (const id of ids) {
      const result = stmt.run(stage, id);
      if (result.changes > 0) affected++;
    }
    logAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      actionType,
      details: { stage, vendor_count: affected, vendor_ids_sample: ids.slice(0, 20) },
    });
  });
  tx();

  return affected;
}

/** Bulk disqualify by filter criteria (not by explicit IDs) */
export function bulkDisqualifyByFilter(
  filters: AdminFilters,
  admin: { userId: string; email: string }
): number {
  ensureAdminTables();
  const { where, params } = buildFilterWhere(filters);

  // Count first
  const count = (
    db.prepare(`SELECT count(*) AS n FROM vendors v ${where}`).get(...params) as { n: number }
  ).n;

  if (count === 0) return 0;

  // Log before executing
  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "bulk_reject",
    details: { filters, expected_count: count },
  });

  const affected = db.prepare(
    `UPDATE vendors SET lifecycle_stage = 'disqualified', last_updated = CURRENT_TIMESTAMP
     WHERE id IN (SELECT v.id FROM vendors v ${where})`
  ).run(...params);

  return affected.changes;
}

/** Bulk hard delete by filter criteria */
export function bulkDeleteByFilter(
  filters: AdminFilters,
  admin: { userId: string; email: string }
): number {
  ensureAdminTables();
  const { where, params } = buildFilterWhere(filters);

  const count = (
    db.prepare(`SELECT count(*) AS n FROM vendors v ${where}`).get(...params) as { n: number }
  ).n;

  if (count === 0) return 0;

  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "bulk_delete",
    details: { filters, count },
  });

  const tx = db.transaction(() => {
    // Clean up related tables
    try {
      db.prepare(`DELETE FROM saved_vendors WHERE vendor_id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
    } catch { /* */ }
    try {
      db.prepare(`DELETE FROM vendor_claims WHERE vendor_id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
    } catch { /* */ }
    try {
      db.prepare(`DELETE FROM vendor_owners WHERE vendor_id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
    } catch { /* */ }
    try {
      db.prepare(`DELETE FROM vendor_enrichments WHERE vendor_id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
    } catch { /* */ }
    try {
      db.prepare(`DELETE FROM vendor_states WHERE vendor_id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
    } catch { /* */ }

    // Delete vendors (FTS triggers handle cleanup)
    db.prepare(`DELETE FROM vendors WHERE id IN (SELECT v.id FROM vendors v ${where})`).run(...params);
  });
  tx();

  return count;
}

/* ================================================================
   Keyword / JSON array operations
   ================================================================ */

export function updateJsonArrayField(
  id: number,
  field: string,
  newValue: string[],
  admin: { userId: string; email: string }
): { success: boolean; error?: string } {
  ensureAdminTables();
  if (!EDITABLE_ARRAYS.has(field)) return { success: false, error: `Field '${field}' is not editable.` };

  const vendor = db.prepare("SELECT id, company_name FROM vendors WHERE id = ?").get(id) as
    { id: number; company_name: string } | undefined;
  if (!vendor) return { success: false, error: "Vendor not found." };

  db.prepare(`UPDATE vendors SET ${field} = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(newValue), id);

  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "keyword_edit",
    targetVendorId: id,
    targetVendorName: vendor.company_name,
    details: { field, new_value: newValue },
  });

  return { success: true };
}

export function bulkAddToJsonArray(
  filters: AdminFilters,
  field: string,
  value: string,
  admin: { userId: string; email: string }
): number {
  ensureAdminTables();
  if (!EDITABLE_ARRAYS.has(field)) return 0;

  const { where, params } = buildFilterWhere(filters);
  const rows = db.prepare(
    `SELECT v.id, v.${field} AS current_val FROM vendors v ${where}`
  ).all(...params) as { id: number; current_val: string | null }[];

  let affected = 0;
  const tx = db.transaction(() => {
    const stmt = db.prepare(`UPDATE vendors SET ${field} = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`);
    for (const row of rows) {
      let arr: string[];
      try {
        arr = JSON.parse(row.current_val || "[]");
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = [];
      }
      if (!arr.includes(value)) {
        arr.push(value);
        stmt.run(JSON.stringify(arr), row.id);
        affected++;
      }
    }
  });
  tx();

  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "keyword_add",
    details: { field, value, filters, affected },
  });

  return affected;
}

export function bulkRemoveFromJsonArray(
  filters: AdminFilters,
  field: string,
  value: string,
  admin: { userId: string; email: string }
): number {
  ensureAdminTables();
  if (!EDITABLE_ARRAYS.has(field)) return 0;

  const { where, params } = buildFilterWhere(filters);
  const rows = db.prepare(
    `SELECT v.id, v.${field} AS current_val FROM vendors v ${where}`
  ).all(...params) as { id: number; current_val: string | null }[];

  let affected = 0;
  const tx = db.transaction(() => {
    const stmt = db.prepare(`UPDATE vendors SET ${field} = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`);
    for (const row of rows) {
      let arr: string[];
      try {
        arr = JSON.parse(row.current_val || "[]");
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = [];
      }
      const idx = arr.indexOf(value);
      if (idx !== -1) {
        arr.splice(idx, 1);
        stmt.run(JSON.stringify(arr), row.id);
        affected++;
      }
    }
  });
  tx();

  logAdminAction({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: "keyword_remove",
    details: { field, value, filters, affected },
  });

  return affected;
}

/* ================================================================
   Statistics
   ================================================================ */

let statsCache: { at: number; value: AdminStats } | null = null;

export function getAdminStats(): AdminStats {
  ensureAdminTables();
  if (statsCache && Date.now() - statsCache.at < 30_000) return statsCache.value;

  const one = (sql: string, ...args: unknown[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;

  const total = one("SELECT count(*) AS n FROM vendors");

  const byTier = db.prepare(
    `SELECT COALESCE(enterprise_tier, 0) AS tier, count(*) AS count FROM vendors GROUP BY tier ORDER BY tier`
  ).all() as { tier: number; count: number }[];

  const byLifecycle = db.prepare(
    `SELECT COALESCE(lifecycle_stage, 'discovered') AS stage, count(*) AS count FROM vendors GROUP BY stage ORDER BY count DESC`
  ).all() as { stage: string; count: number }[];

  const byCompleteness = db.prepare(
    `SELECT COALESCE(completeness_status, 'incomplete') AS status, count(*) AS count FROM vendors GROUP BY status ORDER BY count DESC`
  ).all() as { status: string; count: number }[];

  const byConfidence = db.prepare(
    `SELECT COALESCE(confidence_level, 'unconfirmed') AS level, count(*) AS count FROM vendors GROUP BY level ORDER BY count DESC`
  ).all() as { level: string; count: number }[];

  const topCountries = db.prepare(
    `SELECT country, count(*) AS count FROM vendors WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC LIMIT 15`
  ).all() as { country: string; count: number }[];

  const topBusinessTypes = db.prepare(
    `SELECT primary_business_type AS type, count(*) AS count FROM vendors WHERE primary_business_type IS NOT NULL AND primary_business_type != '' GROUP BY type ORDER BY count DESC LIMIT 15`
  ).all() as { type: string; count: number }[];

  const withWebsite = one("SELECT count(*) AS n FROM vendors WHERE website_url IS NOT NULL AND website_url != ''");
  const withEmail = one("SELECT count(*) AS n FROM vendors WHERE contact_email IS NOT NULL AND contact_email != ''");
  const withPhone = one("SELECT count(*) AS n FROM vendors WHERE contact_phone IS NOT NULL AND contact_phone != ''");
  const sleeping = one("SELECT count(*) AS n FROM vendor_states WHERE state = 'sleeping'");

  const value: AdminStats = {
    total, byTier, byLifecycle, byCompleteness, byConfidence,
    topCountries, topBusinessTypes, withWebsite, withEmail, withPhone, sleeping,
  };
  statsCache = { at: Date.now(), value };
  return value;
}

/* ================================================================
   Export
   ================================================================ */

export function exportVendors(
  filters: AdminFilters,
  format: "csv" | "json"
): { data: string; filename: string; contentType: string } {
  ensureAdminTables();
  const { where, params } = buildFilterWhere(filters);
  const rows = db.prepare(
    `SELECT * FROM vendors v ${where} ORDER BY company_name COLLATE NOCASE ASC LIMIT 100000`
  ).all(...params) as VendorFullRow[];

  if (format === "json") {
    return {
      data: JSON.stringify(rows, null, 2),
      filename: `avlpoint_vendors_${new Date().toISOString().slice(0, 10)}.json`,
      contentType: "application/json",
    };
  }

  // CSV
  if (rows.length === 0) {
    return { data: "", filename: "empty.csv", contentType: "text/csv" };
  }
  const keys = Object.keys(rows[0]) as (keyof VendorFullRow)[];
  const csvRows = [
    keys.join(","),
    ...rows.map((r) =>
      keys.map((k) => {
        const v = r[k];
        if (v === null || v === undefined) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      }).join(",")
    ),
  ];
  return {
    data: csvRows.join("\n"),
    filename: `avlpoint_vendors_${new Date().toISOString().slice(0, 10)}.csv`,
    contentType: "text/csv",
  };
}

/* ================================================================
   Filter builder helper
   ================================================================ */

function buildFilterWhere(filters: AdminFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.tier !== undefined && filters.tier !== null) {
    clauses.push("v.enterprise_tier = ?");
    params.push(filters.tier);
  }
  if (filters.lifecycle) {
    clauses.push("v.lifecycle_stage = ?");
    params.push(filters.lifecycle);
  }
  if (filters.completeness) {
    clauses.push("v.completeness_status = ?");
    params.push(filters.completeness);
  }
  if (filters.confidence) {
    clauses.push("v.confidence_level = ?");
    params.push(filters.confidence);
  }
  if (filters.country) {
    clauses.push("v.country = ?");
    params.push(filters.country);
  }
  if (filters.state) {
    clauses.push("v.state_province = ?");
    params.push(filters.state);
  }
  if (filters.businessType) {
    clauses.push("v.primary_business_type = ?");
    params.push(filters.businessType);
  }
  if (filters.dataSource) {
    clauses.push("v.data_source LIKE ?");
    params.push(`%${filters.dataSource}%`);
  }
  if (filters.hasWebsite === true) {
    clauses.push("v.website_url IS NOT NULL AND v.website_url != ''");
  } else if (filters.hasWebsite === false) {
    clauses.push("(v.website_url IS NULL OR v.website_url = '')");
  }
  if (filters.hasEmail === true) {
    clauses.push("v.contact_email IS NOT NULL AND v.contact_email != ''");
  } else if (filters.hasEmail === false) {
    clauses.push("(v.contact_email IS NULL OR v.contact_email = '')");
  }
  if (filters.sleepState === "sleeping") {
    clauses.push(SLEEPING_SQL);
  } else if (filters.sleepState === "awake") {
    clauses.push(awakeSql("v"));
  }

  if (filters.q?.trim()) {
    const like = `%${filters.q.trim()}%`;
    clauses.push(
      "(v.company_name LIKE ? OR v.company_description LIKE ? OR v.ai_summary LIKE ? OR v.keywords LIKE ?)"
    );
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

/** Count vendors matching a filter (for preview in bulk ops) */
export function countVendorsByFilter(filters: AdminFilters): number {
  ensureAdminTables();
  const { where, params } = buildFilterWhere(filters);
  return (
    db.prepare(`SELECT count(*) AS n FROM vendors v ${where}`).get(...params) as { n: number }
  ).n;
}

/** Get a small sample of vendors matching a filter (for preview) */
export function sampleVendorsByFilter(filters: AdminFilters, limit = 10): { id: number; company_name: string }[] {
  ensureAdminTables();
  const { where, params } = buildFilterWhere(filters);
  return db.prepare(
    `SELECT v.id, v.company_name FROM vendors v ${where} LIMIT ?`
  ).all(...params, limit) as { id: number; company_name: string }[];
}
