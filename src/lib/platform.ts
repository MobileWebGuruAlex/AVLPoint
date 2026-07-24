/**
 * Platform data layer — Phases 3–5 (sandboxes, inspections, meetings)
 * plus Phase 1 leftovers (claims review, owner enrichment, certifications).
 *
 * All tables live in the same SQLite database as the site (vendors.db) but
 * are OWNED BY THE WEBSITE — the discovery pipeline never reads or writes
 * them. Pipeline tables (vendors, vendors_fts, certifications) are never
 * altered here; certification status is layered on via `site_certifications`
 * rather than mutating pipeline columns.
 *
 * Isolation model (SQLite equivalent of the plan's RLS): every read/write
 * is scoped by org_id/user_id inside these functions, and ONLY these
 * functions touch the tables. UI code cannot express a cross-org query.
 *
 * Inspection certifications live in `site_certifications` — the pipeline
 * already owns a scraped `certifications` table with a different schema.
 */
import { db } from "./db";
import { v4 as uuid } from "uuid";
import { isStaffRole } from "./rbac";

let ready = false;
export function ensurePlatformTables() {
  if (ready) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS org_members (
      org_id TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (org_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS private_vendors (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL,
      capabilities TEXT, certifications TEXT, location TEXT, contact TEXT,
      notes TEXT, confidence REAL, source_file TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pv_org ON private_vendors(org_id);
    CREATE TABLE IF NOT EXISTS audit_requests (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, vendor_id INTEGER NOT NULL,
      requested_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
      note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inspectors (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, company TEXT NOT NULL,
      credentials TEXT, regions TEXT, base_price TEXT,
      house INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inspection_requests (
      id TEXT PRIMARY KEY, vendor_id INTEGER NOT NULL, vendor_name TEXT,
      requested_by TEXT NOT NULL, inspector_id TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      quote TEXT, scheduled_for TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inspection_reports (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
      checklist TEXT NOT NULL, notes TEXT, outcome TEXT,
      inspector_user_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    -- NOTE: named site_certifications because the pipeline owns a scraped
    -- \`certifications\` table with a different schema (pipeline contract).
    CREATE TABLE IF NOT EXISTS site_certifications (
      id TEXT PRIMARY KEY, vendor_id INTEGER NOT NULL, level TEXT NOT NULL DEFAULT 'level1',
      report_id TEXT, issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_site_cert_vendor ON site_certifications(vendor_id);
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, org_id TEXT,
      title TEXT NOT NULL, transcript TEXT NOT NULL, report TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vendor_owners (
      vendor_id INTEGER NOT NULL, user_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (vendor_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS vendor_enrichments (
      vendor_id INTEGER PRIMARY KEY, summary TEXT, capabilities TEXT,
      updated_by TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Seed the house inspection option once.
  const house = db.prepare("SELECT id FROM inspectors WHERE house = 1").get();
  if (!house) {
    db.prepare(
      "INSERT INTO inspectors (id, user_id, company, credentials, regions, base_price, house, status) VALUES (?, 'system', 'AVLpoint Inspections', 'AWS CWI · API 510 · NACE Level 2 on staff', 'US Gulf Coast · Midwest · Northeast', 'From $5,000 per audit', 1, 'approved')"
    ).run(uuid());
  }
  ready = true;
}

/* ---------------- Orgs / sandboxes ---------------- */

export interface Org { id: string; name: string; created_by: string; status?: string; role?: string }
export interface PrivateVendor {
  id: string; org_id: string; name: string; capabilities: string | null;
  certifications: string | null; location: string | null; contact: string | null;
  notes: string | null; confidence: number | null; source_file: string | null;
}

export function getOrgForUser(userId: string): Org | null {
  ensurePlatformTables();
  return (db.prepare(
    `SELECT o.*, m.role AS role FROM orgs o JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = ? ORDER BY o.created_at LIMIT 1`
  ).get(userId) as Org | undefined) ?? null;
}

export function createOrg(userId: string, email: string, name: string): Org {
  ensurePlatformTables();
  const id = uuid();
  db.prepare("INSERT INTO orgs (id, name, created_by) VALUES (?, ?, ?)").run(id, name, userId);
  db.prepare("INSERT INTO org_members (org_id, user_id, email, role) VALUES (?, ?, ?, 'admin')").run(id, userId, email);
  return { id, name, created_by: userId, role: "admin" };
}

export function addOrgMember(orgId: string, email: string): string | null {
  ensurePlatformTables();
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()) as { id: string } | undefined;
  if (!user) return "No AVLpoint account exists for that email — have them sign up first.";
  db.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, email) VALUES (?, ?, ?)").run(orgId, user.id, email.toLowerCase());
  return null;
}

export function listOrgMembers(orgId: string) {
  ensurePlatformTables();
  return db.prepare("SELECT email, role FROM org_members WHERE org_id = ?").all(orgId) as { email: string; role: string }[];
}

export interface OrgAdminRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  member_count: number;
  private_vendor_count: number;
  audit_request_count: number;
  owner_email: string | null;
}

/** All workspaces with rollup counts (admin view). */
export function listOrgsAdmin(): OrgAdminRow[] {
  ensurePlatformTables();
  return db.prepare(
    `SELECT o.id, o.name, COALESCE(o.status, 'active') AS status, o.created_at,
       (SELECT count(*) FROM org_members m WHERE m.org_id = o.id) AS member_count,
       (SELECT count(*) FROM private_vendors p WHERE p.org_id = o.id) AS private_vendor_count,
       (SELECT count(*) FROM audit_requests a WHERE a.org_id = o.id) AS audit_request_count,
       (SELECT m.email FROM org_members m WHERE m.org_id = o.id AND m.role = 'admin' ORDER BY m.created_at LIMIT 1) AS owner_email
     FROM orgs o ORDER BY o.created_at DESC LIMIT 200`
  ).all() as OrgAdminRow[];
}

/** Write-blocking guard for sleeping workspaces (reads stay allowed). */
export function orgIsActive(orgId: string): boolean {
  ensurePlatformTables();
  const row = db.prepare("SELECT COALESCE(status, 'active') AS status FROM orgs WHERE id = ?").get(orgId) as
    { status: string } | undefined;
  return row?.status === "active";
}

export function listPrivateVendors(orgId: string, q?: string): PrivateVendor[] {
  ensurePlatformTables();
  if (q) {
    const like = `%${q}%`;
    return db.prepare(
      `SELECT * FROM private_vendors WHERE org_id = ? AND
       (name LIKE ? OR capabilities LIKE ? OR certifications LIKE ? OR location LIKE ? OR notes LIKE ?)
       ORDER BY name LIMIT 40`
    ).all(orgId, like, like, like, like, like) as PrivateVendor[];
  }
  return db.prepare("SELECT * FROM private_vendors WHERE org_id = ? ORDER BY created_at DESC LIMIT 200").all(orgId) as PrivateVendor[];
}

export function insertPrivateVendors(
  orgId: string,
  rows: { name: string; capabilities?: string; certifications?: string; location?: string; contact?: string; notes?: string; confidence?: number }[],
  sourceFile: string
): number {
  ensurePlatformTables();
  const stmt = db.prepare(
    `INSERT INTO private_vendors (id, org_id, name, capabilities, certifications, location, contact, notes, confidence, source_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const r of rows) {
    if (!r.name?.trim()) continue;
    stmt.run(uuid(), orgId, r.name.trim().slice(0, 200), r.capabilities ?? null, r.certifications ?? null,
      r.location ?? null, r.contact ?? null, r.notes ?? null, r.confidence ?? null, sourceFile);
    n++;
  }
  return n;
}

export function createAuditRequest(orgId: string, vendorId: number, userId: string, note: string) {
  ensurePlatformTables();
  db.prepare("INSERT INTO audit_requests (id, org_id, vendor_id, requested_by, note) VALUES (?, ?, ?, ?, ?)")
    .run(uuid(), orgId, vendorId, userId, note || null);
}

export function listAuditRequests(orgId?: string) {
  ensurePlatformTables();
  const sql = `SELECT a.*, v.company_name FROM audit_requests a LEFT JOIN vendors v ON v.id = a.vendor_id`;
  return (orgId
    ? db.prepare(`${sql} WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 50`).all(orgId)
    : db.prepare(`${sql} ORDER BY a.created_at DESC LIMIT 100`).all()) as
    { id: string; vendor_id: number; company_name: string | null; status: string; note: string | null; created_at: string }[];
}

/* ---------------- Inspections & certification ---------------- */

export interface Inspector {
  id: string; user_id: string; company: string; credentials: string | null;
  regions: string | null; base_price: string | null; house: number; status: string;
}
export interface InspectionRequest {
  id: string; vendor_id: number; vendor_name: string | null; requested_by: string;
  inspector_id: string | null; status: string; quote: string | null;
  scheduled_for: string | null; created_at: string; company?: string;
}

export function listInspectors(onlyApproved = true): Inspector[] {
  ensurePlatformTables();
  return db.prepare(
    `SELECT * FROM inspectors ${onlyApproved ? "WHERE status = 'approved'" : ""} ORDER BY house DESC, company`
  ).all() as Inspector[];
}

export function getInspectorById(id: string): Inspector | null {
  ensurePlatformTables();
  return (db.prepare("SELECT * FROM inspectors WHERE id = ?").get(id) as Inspector | undefined) ?? null;
}

/** The inspection company owned by a user, if any (one per user in practice). */
export function getInspectorForUser(userId: string): Inspector | null {
  ensurePlatformTables();
  return (db.prepare(
    "SELECT * FROM inspectors WHERE user_id = ? ORDER BY created_at LIMIT 1"
  ).get(userId) as Inspector | undefined) ?? null;
}

export function applyInspector(userId: string, company: string, credentials: string, regions: string, basePrice: string) {
  ensurePlatformTables();
  db.prepare(
    "INSERT INTO inspectors (id, user_id, company, credentials, regions, base_price) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(uuid(), userId, company, credentials || null, regions || null, basePrice || null);
}

export function createInspectionRequest(vendorId: number, vendorName: string, userId: string, inspectorId: string) {
  ensurePlatformTables();
  db.prepare(
    "INSERT INTO inspection_requests (id, vendor_id, vendor_name, requested_by, inspector_id) VALUES (?, ?, ?, ?, ?)"
  ).run(uuid(), vendorId, vendorName, userId, inspectorId);
}

const STATUS_FLOW: Record<string, string[]> = {
  requested: ["quoted"],
  quoted: ["scheduled"],
  scheduled: ["in_progress"],
  in_progress: ["passed", "failed"],
};

/** Advance a request along the pipeline. Only the assigned inspector's user (or admin) may advance. */
export function advanceInspection(
  requestId: string, actorUserId: string, isAdmin: boolean,
  next: string, data: { quote?: string; scheduledFor?: string }
): string | null {
  ensurePlatformTables();
  const req = db.prepare("SELECT * FROM inspection_requests WHERE id = ?").get(requestId) as InspectionRequest | undefined;
  if (!req) return "Request not found.";
  const inspector = req.inspector_id
    ? (db.prepare("SELECT * FROM inspectors WHERE id = ?").get(req.inspector_id) as Inspector | undefined)
    : undefined;
  const isAssigned = inspector && (inspector.user_id === actorUserId || (inspector.house === 1 && isAdmin));
  if (!isAssigned && !isAdmin) return "Only the assigned inspector can update this job.";
  if (!STATUS_FLOW[req.status]?.includes(next)) return `Cannot move from ${req.status} to ${next}.`;
  db.prepare(
    "UPDATE inspection_requests SET status = ?, quote = COALESCE(?, quote), scheduled_for = COALESCE(?, scheduled_for), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(next, data.quote ?? null, data.scheduledFor ?? null, requestId);
  return null;
}

/** File the report; on pass, issue a Level 1 certification with a 1-year expiry. */
export function fileInspectionReport(
  requestId: string, inspectorUserId: string, checklist: Record<string, boolean>, notes: string, outcome: "passed" | "failed"
): string | null {
  ensurePlatformTables();
  const req = db.prepare("SELECT * FROM inspection_requests WHERE id = ?").get(requestId) as InspectionRequest | undefined;
  if (!req) return "Request not found.";
  const reportId = uuid();
  db.prepare(
    "INSERT OR REPLACE INTO inspection_reports (id, request_id, checklist, notes, outcome, inspector_user_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(reportId, requestId, JSON.stringify(checklist), notes || null, outcome, inspectorUserId);
  db.prepare("UPDATE inspection_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(outcome, requestId);
  if (outcome === "passed") {
    const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    db.prepare("INSERT INTO site_certifications (id, vendor_id, report_id, expires_at) VALUES (?, ?, ?, ?)")
      .run(uuid(), req.vendor_id, reportId, expires);
  }
  return null;
}

export function listInspectionRequestsFor(userId: string, isAdmin: boolean): InspectionRequest[] {
  ensurePlatformTables();
  if (isAdmin) {
    return db.prepare(
      `SELECT r.*, i.company FROM inspection_requests r LEFT JOIN inspectors i ON i.id = r.inspector_id ORDER BY r.updated_at DESC LIMIT 100`
    ).all() as InspectionRequest[];
  }
  return db.prepare(
    `SELECT r.*, i.company FROM inspection_requests r LEFT JOIN inspectors i ON i.id = r.inspector_id
     WHERE r.requested_by = ? OR i.user_id = ? ORDER BY r.updated_at DESC LIMIT 100`
  ).all(userId, userId) as InspectionRequest[];
}

export function getCertification(vendorId: number): { expires_at: string } | null {
  ensurePlatformTables();
  return (db.prepare(
    "SELECT expires_at FROM site_certifications WHERE vendor_id = ? AND expires_at >= date('now') ORDER BY expires_at DESC LIMIT 1"
  ).get(vendorId) as { expires_at: string } | undefined) ?? null;
}

export interface CertificationAdminRow {
  id: string;
  vendor_id: number;
  company_name: string | null;
  level: string;
  issued_at: string;
  expires_at: string;
}

export function listCertificationsAdmin(): CertificationAdminRow[] {
  ensurePlatformTables();
  return db.prepare(
    `SELECT c.id, c.vendor_id, v.company_name, c.level, c.issued_at, c.expires_at
     FROM site_certifications c LEFT JOIN vendors v ON v.id = c.vendor_id
     ORDER BY c.issued_at DESC LIMIT 200`
  ).all() as CertificationAdminRow[];
}

export function revokeCertification(certId: string): { vendor_id: number; company_name: string | null } | null {
  ensurePlatformTables();
  const row = db.prepare(
    `SELECT c.vendor_id, v.company_name FROM site_certifications c LEFT JOIN vendors v ON v.id = c.vendor_id WHERE c.id = ?`
  ).get(certId) as { vendor_id: number; company_name: string | null } | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM site_certifications WHERE id = ?").run(certId);
  return row;
}

/* ---------------- Meetings (Phase 5) ---------------- */

export function saveMeeting(userId: string, orgId: string | null, title: string, transcript: string, report: unknown): string {
  ensurePlatformTables();
  const id = uuid();
  db.prepare("INSERT INTO meetings (id, user_id, org_id, title, transcript, report) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, orgId, title, transcript, JSON.stringify(report));
  return id;
}

export function listMeetings(userId: string) {
  ensurePlatformTables();
  return db.prepare("SELECT id, title, created_at FROM meetings WHERE user_id = ? ORDER BY created_at DESC LIMIT 25")
    .all(userId) as { id: string; title: string; created_at: string }[];
}

export function getMeeting(id: string, userId: string) {
  ensurePlatformTables();
  return (db.prepare("SELECT * FROM meetings WHERE id = ? AND user_id = ?").get(id, userId) as
    { id: string; title: string; transcript: string; report: string; created_at: string } | undefined) ?? null;
}

/* ---------------- Claims admin + owner enrichment (Phase 1 leftovers) ---------------- */

export function listPendingClaims() {
  ensurePlatformTables();
  db.exec(`CREATE TABLE IF NOT EXISTS vendor_claims (
    id TEXT PRIMARY KEY, vendor_id INTEGER NOT NULL, user_id TEXT NOT NULL,
    work_email TEXT NOT NULL, proof_note TEXT, status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  return db.prepare(
    `SELECT c.*, v.company_name FROM vendor_claims c LEFT JOIN vendors v ON v.id = c.vendor_id
     WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 50`
  ).all() as { id: string; vendor_id: number; company_name: string | null; work_email: string; proof_note: string | null; user_id: string; created_at: string }[];
}

export function resolveClaim(claimId: string, approve: boolean): string | null {
  ensurePlatformTables();
  const claim = db.prepare("SELECT * FROM vendor_claims WHERE id = ? AND status = 'pending'").get(claimId) as
    { vendor_id: number; user_id: string } | undefined;
  if (!claim) return "Claim not found or already resolved.";
  db.prepare("UPDATE vendor_claims SET status = ? WHERE id = ?").run(approve ? "approved" : "rejected", claimId);
  if (approve) {
    db.prepare("INSERT OR IGNORE INTO vendor_owners (vendor_id, user_id) VALUES (?, ?)").run(claim.vendor_id, claim.user_id);
  }
  return null;
}

export function isVendorOwner(vendorId: number, userId: string): boolean {
  ensurePlatformTables();
  return Boolean(db.prepare("SELECT 1 FROM vendor_owners WHERE vendor_id = ? AND user_id = ?").get(vendorId, userId));
}

export function getEnrichment(vendorId: number) {
  ensurePlatformTables();
  return (db.prepare("SELECT * FROM vendor_enrichments WHERE vendor_id = ?").get(vendorId) as
    { summary: string | null; capabilities: string | null; updated_at: string } | undefined) ?? null;
}

export function upsertEnrichment(vendorId: number, userId: string, summary: string, capabilities: string) {
  ensurePlatformTables();
  db.prepare(
    `INSERT INTO vendor_enrichments (vendor_id, summary, capabilities, updated_by, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(vendor_id) DO UPDATE SET summary=excluded.summary, capabilities=excluded.capabilities,
       updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`
  ).run(vendorId, summary || null, capabilities || null, userId);
}

/* ---------------- Admin gate ---------------- */

/**
 * Staff gate. Role comes from the users table via getSession (live, not
 * from the JWT), so this is authoritative. Granular checks on top of it
 * use rbac.can(); no email allowlists, no environment backdoors.
 */
export function isAdminSession(session: { role: string; email: string }): boolean {
  return isStaffRole(session.role);
}
