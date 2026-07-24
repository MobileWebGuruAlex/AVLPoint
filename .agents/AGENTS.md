<!-- BEGIN: AVLpoint Database Strategy -->
# Database Strategy

AVLpoint runs on SQLite (`vendors.db`, better-sqlite3 + WAL) for both the data
pipeline and the web app — see `docs/ADMIN_SPEC.md`. This is deliberate for the
local/pre-hosting phase. A Supabase (PostgreSQL + pgvector) migration exists as a
prepared path (`migrate_to_supabase.py`) and becomes relevant at hosting scale;
it is **not** a prerequisite for building features. (An earlier directive here
demanded migration before any web feature — superseded 2026-07-24, see
`docs/PIPELINE_SPEC.md`.)
<!-- END: AVLpoint Database Strategy -->

<!-- BEGIN: Vendor Data Integrity -->
# Vendor Data Integrity

**CRITICAL DIRECTIVE**: The existing vendor database is our source of truth. Do not create duplicate vendors, delete vendors, merge records incorrectly, overwrite valuable information, or remove any data we have already spent weeks collecting.

Your primary objective is enrichment, not replacement.

Specifically:
1. Never duplicate an existing vendor. Always determine whether a company already exists before creating a new record.
2. Never remove or discard existing vendor records unless explicitly instructed to do so.
3. Never delete existing fields or replace verified data with lower-confidence information.
4. Continuously enrich existing vendors by adding new information, filling missing fields, improving descriptions, expanding capabilities, adding certifications, contact details, technologies, industries served, equipment, compliance information, and any other relevant metadata.
5. Only create new vendors when you have high confidence they do not already exist in the database.
6. When enriching a vendor, preserve everything that already exists and only add or improve information.

The goal is for every pass through the pipeline to make the database richer than before. Every vendor should become more complete over time, never less complete. Evaluate every enrichment decision against the website and product we have built to ensure it supports comprehensive, useful vendor profiles.
<!-- END: Vendor Data Integrity -->
