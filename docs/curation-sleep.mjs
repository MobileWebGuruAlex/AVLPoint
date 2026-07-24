import Database from 'better-sqlite3';
const db = new Database('vendors.db');
db.pragma('busy_timeout = 8000');
const DRY = process.argv.includes('--dry');

const SPECIFIC = `(
  primary_business_type IS NOT NULL AND primary_business_type!=''
  AND lower(primary_business_type) NOT IN ('manufacturer/fabricator','manufacturer','fabricator','distributor')
  AND ( lower(primary_business_type) LIKE '%fabricat%' OR lower(primary_business_type) LIKE '%manufactur%'
    OR lower(primary_business_type) LIKE '%machin%' OR lower(primary_business_type) LIKE '%weld%'
    OR lower(primary_business_type) LIKE '%metal%' OR lower(primary_business_type) LIKE '%steel%'
    OR lower(primary_business_type) LIKE '%vessel%' OR lower(primary_business_type) LIKE '%cnc%'
    OR lower(primary_business_type) LIKE '%foundry%' OR lower(primary_business_type) LIKE '%cast%'
    OR lower(primary_business_type) LIKE '%tool%' OR lower(primary_business_type) LIKE '%precision%'
    OR lower(primary_business_type) LIKE '%forging%' OR lower(primary_business_type) LIKE '%stamping%'
    OR lower(primary_business_type) LIKE '%sheet%' OR lower(primary_business_type) LIKE '%plate%'
    OR lower(primary_business_type) LIKE '%boiler%' OR lower(primary_business_type) LIKE '%pipe%'
    OR lower(primary_business_type) LIKE '%pressure%' OR lower(primary_business_type) LIKE '%valve%'
    OR lower(primary_business_type) LIKE '%conveyor%' OR lower(primary_business_type) LIKE '%coating%'
    OR lower(primary_business_type) LIKE '%iron%' OR lower(primary_business_type) LIKE '%works%'
    OR lower(primary_business_type) LIKE '%tank%' OR lower(primary_business_type) LIKE '%tube%'
    OR lower(primary_business_type) LIKE '%hvac%' OR lower(primary_business_type) LIKE '%material handling%'
    OR lower(primary_business_type) LIKE '%industrial%' )
)`;
const GENERIC_MFR = `(lower(primary_business_type) IN ('manufacturer/fabricator','manufacturer','fabricator'))`;

// Strong fabrication keywords in the NAME itself — rescues real shops with no business_type.
const NAME_INDUSTRIAL = `(
  lower(company_name) LIKE '%weld%' OR lower(company_name) LIKE '%fabricat%'
  OR lower(company_name) LIKE '%machining%' OR lower(company_name) LIKE '%machine shop%'
  OR lower(company_name) LIKE '%cnc%' OR lower(company_name) LIKE '%metal works%'
  OR lower(company_name) LIKE '%metalworks%' OR lower(company_name) LIKE '%steel fab%'
  OR lower(company_name) LIKE '%sheet metal%' OR lower(company_name) LIKE '%foundry%'
  OR lower(company_name) LIKE '%forging%' OR lower(company_name) LIKE '%waterjet%'
  OR lower(company_name) LIKE '%laser cut%' OR lower(company_name) LIKE '%pressure vessel%'
  OR lower(company_name) LIKE '%pipe fab%' OR lower(company_name) LIKE '%ironworks%'
  OR lower(company_name) LIKE '%iron works%' OR lower(company_name) LIKE '%stainless fab%'
)`;

const BAD_NAME = `(length(company_name)>70 OR length(trim(company_name))<3
  OR company_name LIKE '%sorry%' OR company_name LIKE '%page or file%' OR company_name LIKE '%requested may%'
  OR company_name LIKE '%404%' OR company_name LIKE '% not found%' OR company_name LIKE 'http%'
  OR company_name LIKE '%www.%' OR company_name LIKE '%.com/%' OR company_name LIKE 'Category:%'
  OR company_name LIKE '%List of %' OR company_name LIKE 'Prospective %' OR company_name LIKE 'Applicant%'
  OR company_name LIKE 'Top 10 %' OR company_name LIKE 'Top 20 %' OR company_name LIKE 'Top 5 %'
  OR company_name LIKE 'We''re %' OR company_name LIKE 'Try %' OR company_name LIKE '% email account'
  OR company_name LIKE 'Cómo %' OR company_name LIKE 'Download %' OR company_name LIKE 'Buy %'
  OR company_name LIKE '%WhatsApp%' OR company_name LIKE '%Cheap Flights%' OR company_name LIKE 'Is %'
  OR company_name LIKE '%retiring%' OR company_name LIKE 'Prime Video%' OR company_name LIKE 'Discover %'
  OR company_name LIKE 'Learn %' OR company_name LIKE 'Once %' OR company_name LIKE 'Use %'
  OR company_name LIKE 'Home [%' OR company_name LIKE '% stumbled' OR company_name LIKE 'How %'
  OR company_name LIKE '%Search API%' OR company_name LIKE 'File Explorer%' OR company_name LIKE 'Outlook%'
  OR lower(trim(company_name)) IN ('company','manufacturer','fabricator','supplier','vendor','unknown','n/a','na','none','null','test','marketplace','products','services','optical','nsgc','tech companies','surgical instruments','household appliences','communications equipment','on','paradise','defence roles'))`;

const hasWeb = `(website_url IS NOT NULL AND website_url!='')`;
const hasContact = `((contact_email IS NOT NULL AND contact_email!='') OR (contact_phone IS NOT NULL AND contact_phone!=''))`;

const KEEP = `(
  NOT ${BAD_NAME}
  AND (
    ${SPECIFIC}
    OR (${GENERIC_MFR} AND ${hasWeb} AND (${hasContact} OR completeness_status='verified'))
    OR (${NAME_INDUSTRIAL} AND ${hasWeb} AND ${hasContact})
    OR (completeness_status='verified' AND ${hasWeb} AND ${hasContact})
    OR (enterprise_tier=1 AND ${hasWeb} AND ${hasContact})
  )
)`;

const keep = db.prepare(`SELECT count(*) n FROM vendors v WHERE ${KEEP}`).get().n;
const sleep = db.prepare(`SELECT count(*) n FROM vendors v WHERE NOT (${KEEP})`).get().n;
console.log('KEEP', keep, ' SLEEP', sleep, DRY ? '(DRY RUN)' : '(COMMITTING)');

if (DRY) {
  console.log('\n30 more KEPT:');
  console.log(db.prepare(`SELECT company_name n FROM vendors v WHERE ${KEEP} ORDER BY random() LIMIT 30`).all().map(r=>'  '+r.n).join('\n'));
  process.exit(0);
}

// Commit: insert sleeping overlay rows for everything NOT kept, in one transaction.
const ids = db.prepare(`SELECT id FROM vendors v WHERE NOT (${KEEP}) AND id NOT IN (SELECT vendor_id FROM vendor_states WHERE state='sleeping')`).all();
const ins = db.prepare(`INSERT INTO vendor_states (vendor_id, state, reason, changed_by, changed_at)
  VALUES (?, 'sleeping', 'Automated curation: non-industrial / junk / unqualified record', 'system:curation', datetime('now'))
  ON CONFLICT(vendor_id) DO UPDATE SET state='sleeping', reason=excluded.reason, changed_by=excluded.changed_by, changed_at=datetime('now')`);
const tx = db.transaction(() => { for (const {id} of ids) ins.run(id); });
tx();

// One audit row summarizing the bulk action.
import crypto from 'node:crypto';
db.prepare(`INSERT INTO admin_actions (id, admin_user_id, admin_email, action_type, entity_type, details)
  VALUES (?, 'cli', 'curation-script', 'vendor.bulk_sleep', 'vendor', ?)`)
  .run(crypto.randomUUID(), JSON.stringify({ slept: ids.length, kept: keep, method: 'SQL heuristic curation', reversible: true }));

const asleep = db.prepare(`SELECT count(*) n FROM vendor_states WHERE state='sleeping'`).get().n;
const awake = db.prepare(`SELECT count(*) n FROM vendors v WHERE NOT EXISTS(SELECT 1 FROM vendor_states s WHERE s.vendor_id=v.id AND s.state='sleeping')`).get().n;
console.log(`\nDONE. Newly slept: ${ids.length}. Total asleep: ${asleep}. Awake (public): ${awake}.`);
