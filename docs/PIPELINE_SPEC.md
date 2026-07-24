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
        ▼                          stages: queued → scraped → submitted → done|failed
[scraper.py]  local Playwright, $0, polite (1 req/2s per domain, ≤6 pages/site)
        ▼     cache: pipeline_v3/cache/{vendor_id}.json + content hash
[enrich.py]   claude-haiku-4-5 via Batch API (50% discount)
        │     structured JSON output (schema-enforced), prompt-cached system prompt
        ▼
[ingest]      ADD-ONLY merge into vendors:
              • ai_summary written (this is the field we're building)
              • scalars filled only if currently empty
              • list fields union-merged, nothing ever removed
              • lifecycle: → 'enriched' unless already fully_built/locked
[daemon.py]   continuous loop; $10/day hard cap in enrich_v3_budget; safe to kill
```

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

Manual steps: `scraper.py N` · `enrich.py submit [--limit N]` ·
`enrich.py status <batch_id>` · `enrich.py ingest <batch_id>`.

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
