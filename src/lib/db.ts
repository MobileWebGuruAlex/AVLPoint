import Database from 'better-sqlite3';
import path from 'path';

// Using a global variable to prevent creating multiple connections
// during hot-reloads in Next.js development.
const globalForDb = global as unknown as {
  db: Database.Database | undefined
};

export const db =
  globalForDb.db ??
  new Database(path.join(process.cwd(), 'vendors.db'), {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

// Enable WAL mode for better concurrency since the background pipeline is also writing to it.
db.pragma('journal_mode = WAL');
// The pipeline holds write locks in bursts — wait instead of failing with SQLITE_BUSY.
db.pragma('busy_timeout = 5000');

// Define TypeScript interfaces matching the SQLite schema
export interface Vendor {
  id: number;
  company_name: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_description: string | null;
  ai_summary: string | null;
  services: string | null; // Stored as JSON string
  products: string | null; // Stored as JSON string
  industries_served: string | null; // Stored as JSON string
  geographic_service_areas: string | null; // Stored as JSON string
  certifications_held: string | null; // Stored as JSON string
  capabilities: string | null; // Stored as JSON string
  equipment_list: string | null; // Stored as JSON string
  year_established: number | null;
  employee_count: number | null;
  facility_size_sqft: number | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal_code: string | null;
  country: string | null;
  social_profiles: string | null; // Stored as JSON string
  key_personnel: string | null; // Stored as JSON string
  keywords: string | null; // Stored as JSON string
  search_tags: string | null; // Stored as JSON string
  use_cases: string | null; // Stored as JSON string
  vendor_categories: string | null; // Stored as JSON string
  project_types: string | null; // Stored as JSON string
  technical_specialties: string | null; // Stored as JSON string
  logo_url: string | null;
  data_source: string | null;
  last_updated: string;
}

export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  vendor_id: number | null;
  status: UserStatus;
  last_login_at: string | null;
  must_change_password: number;
  created_at: string;
}

/* ================================================================
   Site-owned schema bootstrap.

   Runs once per process at import time, BEFORE any query can execute,
   so downstream code (including the try/catch → mock fallbacks in
   vendors.ts) never sees a missing table. Everything here is
   idempotent and only touches WEBSITE-owned tables — the pipeline's
   `vendors` / `vendors_fts` schema is never altered (pipeline contract).
   ================================================================ */

function addColumn(table: string, columnDef: string) {
  // SQLite has no IF NOT EXISTS for columns; a duplicate-column error means done.
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); } catch { /* exists */ }
}

function ensureSiteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'buyer',
      first_name TEXT,
      last_name TEXT,
      vendor_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Server-side sessions: the JWT carries only the session id (jti);
    -- deleting/revoking a row here kills the session immediately.
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Sleep state overlay for pipeline-owned vendor rows. A row with
    -- state='sleeping' hides the vendor from every user-facing surface;
    -- deleting the row (wake) restores it. The vendors table itself is
    -- never altered.
    CREATE TABLE IF NOT EXISTS vendor_states (
      vendor_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'sleeping',
      reason TEXT,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_states_state ON vendor_states(state);

    -- Login throttling: every attempt recorded, lockout derived by query.
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      ip TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);

    -- Invitations: single-use, expiring tokens that pre-assign a role
    -- (and optionally an org) at signup.
    CREATE TABLE IF NOT EXISTS invitations (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'buyer',
      org_id TEXT,
      invited_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      accepted_at TEXT
    );

    -- Owner-customized public presentation of a claimed vendor profile
    -- (LinkedIn-style card/page builder). Overlay — vendors table untouched.
    CREATE TABLE IF NOT EXISTS vendor_profiles (
      vendor_id INTEGER PRIMARY KEY,
      template TEXT NOT NULL DEFAULT 'classic',
      accent TEXT,
      tagline TEXT,
      about TEXT,
      banner_image TEXT,
      gallery TEXT DEFAULT '[]',
      highlights TEXT DEFAULT '[]',
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Inspector public profile with selectable template skins.
    CREATE TABLE IF NOT EXISTS inspector_profiles (
      inspector_id TEXT PRIMARY KEY,
      template TEXT NOT NULL DEFAULT 'field',
      accent TEXT,
      tagline TEXT,
      bio TEXT,
      photo_image TEXT,
      banner_image TEXT,
      gallery TEXT DEFAULT '[]',
      certifications TEXT DEFAULT '[]',
      service_regions TEXT DEFAULT '[]',
      specialties TEXT DEFAULT '[]',
      pricing_note TEXT,
      years_experience INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Free-form internal notes attachable to any entity.
    CREATE TABLE IF NOT EXISTS admin_notes (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      note TEXT NOT NULL,
      author_email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_notes_entity ON admin_notes(entity_type, entity_id);

    -- Created here (not just in platform.ts) so the status column exists
    -- from day one on fresh databases; platform.ts's CREATE IF NOT EXISTS no-ops.
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Generalized audit log (admin.ts adds indexes). entity_type/entity_id
    -- cover users/orgs/inspectors/etc; vendor columns kept for compatibility.
    CREATE TABLE IF NOT EXISTS admin_actions (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_vendor_id INTEGER,
      target_vendor_name TEXT,
      entity_type TEXT NOT NULL DEFAULT 'vendor',
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Website-token verification on claims (vendor_claims may pre-exist).
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS vendor_claims (
      id TEXT PRIMARY KEY, vendor_id INTEGER NOT NULL, user_id TEXT NOT NULL,
      work_email TEXT NOT NULL, proof_note TEXT, status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  } catch { /* exists */ }
  addColumn('vendor_claims', 'verify_token TEXT');
  addColumn('vendor_claims', 'verified_at TEXT');
  addColumn('vendor_claims', "verify_method TEXT");

  // Upgrades for databases created before these columns existed.
  addColumn('users', "status TEXT NOT NULL DEFAULT 'active'");
  addColumn('users', 'last_login_at TEXT');
  addColumn('users', 'must_change_password INTEGER NOT NULL DEFAULT 0');
  addColumn('orgs', "status TEXT NOT NULL DEFAULT 'active'");
  addColumn('admin_actions', "entity_type TEXT NOT NULL DEFAULT 'vendor'");
  addColumn('admin_actions', 'entity_id TEXT');
}

ensureSiteSchema();

// Example usage queries you can import and use in React Server Components
export const dbQueries = {
  getVendors: (limit = 50) => {
    return db.prepare('SELECT * FROM vendors ORDER BY last_updated DESC LIMIT ?').all(limit) as Vendor[];
  },

  getVendorById: (id: number) => {
    return db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor | undefined;
  },

  searchVendors: (query: string, limit = 50) => {
    // If you have FTS5 configured, you can swap this for the MATCH query
    return db.prepare(`
      SELECT * FROM vendors
      WHERE company_name LIKE ? OR company_description LIKE ? OR ai_summary LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as Vendor[];
  }
};
