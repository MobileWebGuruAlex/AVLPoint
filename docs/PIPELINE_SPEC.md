# AVLpoint Enrichment Pipeline v3 — Source of Truth

*Supersedes the enrichment sections of `PARTNER_HANDOFF.md`, the pipeline notes in
`FileClaude/AVLpoint_Master_Plan.md`, and the Supabase-first directive in
`.agents/AGENTS.md` (see "Directives" below). Written 2026-07-24.*

## Goal

Every vendor profile should let a procurement engineer decide whether to request a
quote: an ~800–1,200-word grounded synopsis plus fully populated structured fields —
certifications, capabilities, services, equipment, industries served, facility,
contacts. Profiles must never contain invented facts.

## Architecture

```
verified vendors (vendors.db)
        │  seed_queue()            state table: enrich_v3_state
        ▼                          queued → scraped → submitted → done|failed|triaged_out
[scraper.py]  local Playwright, $0, polite (1 req/2s per domain, ≤6 pages/site)
        ▼     cache: pipeline_v3/cache/{vendor_id}.json + content hash
[augment.py]  FREE multi-source corroboration + junk gate
        │     • Wikidata      (free, no key)   → founding year, employees, description
        │     • EPA ECHO      (free, no key)   → verified facility, NAICS/SIC codes
        │       ⚠ TWO-STEP API: get_facilities→QueryID, then get_download (CSV only,
        │         JSON is rejected); throttles hard — 3s inter-step sleep, fail-soft
        │     • OpenStreetMap (free, no key)   → address geocode + site type
        │       ⚠ searches the STREET ADDRESS (company names are sparse in OSM) and
        │         verifies the house number matches, or Nominatim returns a near-miss
        │     • OpenCorporates — needs OPENCORPORATES_API_TOKEN; anon tier now 401s,
        │       so it self-disables after one failure (no wasted calls)
        │     • triage: OpenRouter (gpt-4o-mini) flags non-companies → sleep overlay
        ▼       (NEVER deleted — reversible from the admin approval queue)
[contacts.py] delta-only contact recovery (skips any vendor that already has the field)
        │     Tier 0 free : targeted /contact, /contact-us, /about via Playwright
        │     Tier A free : sources/parsers.py regex (tel:, mailto:, JSON-LD,
        │                   obfuscated "sales at co dot com", footer patterns)
        │     Tier B cheap: google/gemini-2.5-flash via OpenRouter — ONLY if Tier A
        ▼                   fails, and skipped entirely if the page has no "@"/digits
[enrich.py]   claude-haiku-4-5 via Batch API (50% discount)
        │     website text + REGISTRY FACTS block → structured JSON (schema-enforced)
        ▼     prompt-cached system prompt
[ingest]      ADD-ONLY merge into vendors:
              • ai_summary written (this is the field we're building)
              • scalars filled only if currently empty
              • list fields union-merged, nothing ever removed
              • contacts grounding-checked: must appear verbatim on the page
              • lifecycle: → 'enriched' unless already fully_built/locked
[daemon.py]   4-hour cycle; $10/day hard cap in enrich_v3_budget; safe to kill
```

## Validation rules (learned the hard way)

- **Phones**: 10–15 digits (E.164) and the full digit run must appear contiguously
  in the source text. Matching only the last 10 digits lets ZIP+4 codes
  (`92509-3106`), year ranges (`2019-2024`), and concatenated garbage
  (`3245578475922`) through.
- **Emails**: must match a strict pattern, not be a placeholder domain
  (`example.`, `yoursite.`, `sentry.`, `wixpress.`), and appear verbatim.
- **Never bulk-audit by `last_updated`** — that column is touched by every
  process. Scope repair queries to rows this pipeline actually wrote
  (`enrich_v3_state`), or you will null out unrelated legitimate data.

## Cost model (measured July 2026)

| Item | Rate |
|---|---|
| Scraping | $0 (local Playwright) |
| Haiku 4.5 batched | $0.50 in / $2.50 out per Mtok |
| Per vendor (observed) | ~$0.02–0.03 |
| 11,883 verified wave | ~$130–300 total |
| Old pipeline (Sonnet, per-call, Firecrawl) | ~$0.10–0.13/vendor + Firecrawl credits |

## State & observability

- `enrich_v3_state` — one row per vendor: stage, batch id, tokens, exact cost, error.
- `enrich_v3_budget` — spend per day; daemon refuses to submit past `DAILY_BUDget` cap
  (`state.DAILY_BUDGET_USD`, currently $10).
- Nothing re-runs unless content hash changes, the row is older than 90 days
  (refresh cycle), or an operator resets the stage.
- Quick status: `python -c "import state; print(state.stats(state.connect()))"`.

## Operating it

```powershell
cd C:\Projects\AVLpoint\pipeline_v3
..\venv\Scripts\python.exe daemon.py                  # foreground
# or register at logon:
schtasks /Create /TN "AVLpoint Pipeline v3" /SC ONLOGON /TR "powershell -ExecutionPolicy Bypass -File C:\Projects\AVLpoint\pipeline_v3\run_v3.ps1"
```

Manual steps: `scraper.py N` · `augment.py N` · `contacts.py N` ·
`enrich.py submit [--limit N]` · `enrich.py status <batch_id>` ·
`enrich.py ingest <batch_id>`.

## Model policy (cost discipline)

| Job | Model | Why |
|---|---|---|
| Profile synthesis | `claude-haiku-4-5` (Batch API) | $0.50/$2.50 per Mtok batched — 6× cheaper than the old Sonnet-per-call path |
| Contact extraction fallback | `google/gemini-2.5-flash` via OpenRouter | pennies; only fires when free regex fails |
| Junk triage | `openai/gpt-4o-mini` via OpenRouter | ~4 output tokens per verdict |

No Opus/Sonnet anywhere in the pipeline. Scraping and all four registry sources
are $0.

**Keys**: `AVL_ANTHROPIC_API_KEY` (required), `OPENROUTER_API_KEY` (required for
triage + Tier B). Optional: `OPENCORPORATES_API_TOKEN` unlocks the company
registry leg. There is **no Gemini or Google Maps key in `.env`** — Gemini is
reached through OpenRouter, and OpenRouter cannot proxy the Google Maps Places
API (it routes LLMs only), so physical-address verification uses OpenStreetMap
Nominatim instead. Adding a `GOOGLE_MAPS_API_KEY` would let a Places leg be
added to `augment.py` for front-desk phone numbers.

## Directives (binding)

1. **Vendor data integrity** (from `.agents/AGENTS.md`, still binding): enrichment
   only adds or fills. Never duplicate, delete, or overwrite existing vendor data
   with lower-confidence data.
2. **Supabase migration** (from `.agents/AGENTS.md`, *deferred*): the original
   directive said to migrate before building web features. The web app shipped on
   SQLite (see `docs/ADMIN_SPEC.md`); migration via `migrate_to_supabase.py` is a
   hosting-scale decision, not a blocker. The old directive should not be treated
   as binding by future agents.
3. **Grounding**: profiles state only what the scraped text supports. Empty is
   better than invented.
4. **Budget**: hard daily cap; the pre-submit estimate gates batch size, the
   post-ingest actual cost is recorded per vendor.

## Known data-quality debt (not this pipeline's job to delete)

"Verified" still contains junk records (e.g. scraped PDF permits, event pages,
subpages-as-companies). Handle through the admin approval queue / vendor_states
sleep overlay — never by deletion. Examples seen 2026-07-24: vendor #10048
("SC Machinery EXPOMAFE 2025 Brazil" — an event page), #10432 ("History -
National Machinery llc" — a subpage title as company name).
