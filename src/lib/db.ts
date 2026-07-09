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

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  vendor_id: number | null;
  created_at: string;
}

// Ensure the users table exists in the database just in case it doesn't
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'buyer',
    first_name TEXT,
    last_name TEXT,
    vendor_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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
