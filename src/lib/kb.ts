/**
 * Site-wide knowledge base — grounds the chatbot in AVLpoint's own facts so it
 * answers directly instead of blindly redirecting. Stored as an FTS5 table in
 * vendors.db; seeded once from the docs below.
 */
import { db } from "./db";

interface Doc { title: string; body: string; tags: string }

const DOCS: Doc[] = [
  {
    title: "What AVLpoint is",
    tags: "about platform overview",
    body: "AVLpoint is a US-focused, AI-powered vendor-intelligence platform for industrial fabrication sourcing. AI agents discover, enrich, and verify manufacturers and fabricators (welding, CNC machining, structural steel, pressure vessels, sheet metal, piping, coatings) into decision-grade supplier profiles. Default results are United States vendors; international is shown only when a user selects the International or Worldwide region option.",
  },
  {
    title: "Geographic scope and defaults",
    tags: "us international region country location default",
    body: "By default AVLpoint shows US-only vendors everywhere: search, recommendations, featured, and the assistant. To see international suppliers, use the Region selector on the search page and pick International (non-US only) or Worldwide (US + international). The assistant only includes international vendors when the user explicitly asks for international, global, or a specific non-US country.",
  },
  {
    title: "Vendor search",
    tags: "search find vendors filters sort region",
    body: "Search at /search by capability, certification (ASME, AWS, ISO 9001, AS9100, NADCAP, ITAR), business type, tier, and keyword. Sort by Best match, Enterprise tier, Name, or Recently updated. Region selector controls US vs International. Results are ranked full-text matches grounded in real records — never invented.",
  },
  {
    title: "Enterprise sandbox and private AVL",
    tags: "enterprise sandbox upload private avl buyers",
    body: "Enterprise buyers can create a private, secure workspace at /sandbox, upload their own approved-vendor lists, and keep them isolated per organization. Workspaces can be paused (slept) by admins without losing data.",
  },
  {
    title: "Meeting copilot",
    tags: "meetings copilot compare recommend hire inspector",
    body: "At /meetings, paste or record a project meeting transcript. The copilot extracts sourcing needs, compares your uploaded AVL against AVLpoint's directory, recommends who to hire with grounded reasons, and suggests an inspector when independent verification is advised.",
  },
  {
    title: "Claiming and verifying a vendor profile",
    tags: "vendor claim verify ownership profile builder",
    body: "A company owner claims their profile at /claim, then verifies control instantly by placing a unique code on their website (homepage HTML or /avlpoint-verify.txt). Once verified they get a LinkedIn-style profile builder: template, brand color, tagline, about, banner, gallery, and highlight stats. Manual review is the fallback.",
  },
  {
    title: "Inspections and Level 1 Certification",
    tags: "inspection inspector certification level 1 marketplace trust",
    body: "The inspection marketplace is at /inspections. Buyers pick any approved inspector (AVLpoint's house team or independents on equal footing). Jobs move requested → quoted → scheduled → in progress → passed/failed. A pass auto-issues a 1-year Level 1 Certification. Inspectors build their own profile with selectable skins, certifications, regions, and pricing.",
  },
  {
    title: "Trust Ladder",
    tags: "trust ladder listed claimed verified certified",
    body: "Vendors climb: Listed (in the database) → Claimed (owner controls the profile) → Verified (documents/website checked) → Level 1 Certified (independent on-site inspection). Higher rungs rank higher in AI search seen by enterprise buyers.",
  },
  {
    title: "Pricing and accounts",
    tags: "pricing plans account signup free",
    body: "Create a free account at /signup to unlock contact details and save shortlists. Claiming is free during early access. Verified membership and Level 1 certification tiers are on /pricing.",
  },
];

let ready = false;
function ensureKb() {
  if (ready) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_docs (id INTEGER PRIMARY KEY, title TEXT, body TEXT, tags TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_docs_fts USING fts5(title, body, tags, content='kb_docs', content_rowid='id');
  `);
  const n = (db.prepare("SELECT count(*) AS n FROM kb_docs").get() as { n: number }).n;
  if (n === 0) {
    const ins = db.prepare("INSERT INTO kb_docs (title, body, tags) VALUES (?, ?, ?)");
    const insFts = db.prepare("INSERT INTO kb_docs_fts (rowid, title, body, tags) VALUES (?, ?, ?, ?)");
    const tx = db.transaction(() => {
      for (const d of DOCS) {
        const r = ins.run(d.title, d.body, d.tags);
        insFts.run(r.lastInsertRowid, d.title, d.body, d.tags);
      }
    });
    tx();
  }
  ready = true;
}

/** Top KB passages for a query (FTS with LIKE fallback). */
export function searchKb(query: string, limit = 3): { title: string; body: string }[] {
  ensureKb();
  const terms = query.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 2).slice(0, 8);
  if (terms.length) {
    try {
      const match = terms.map((t) => `"${t}"*`).join(" OR ");
      const rows = db.prepare(
        `SELECT d.title, d.body FROM kb_docs_fts f JOIN kb_docs d ON d.id = f.rowid
         WHERE kb_docs_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(match, limit) as { title: string; body: string }[];
      if (rows.length) return rows;
    } catch { /* fall through */ }
  }
  return db.prepare("SELECT title, body FROM kb_docs LIMIT ?").all(limit) as { title: string; body: string }[];
}
