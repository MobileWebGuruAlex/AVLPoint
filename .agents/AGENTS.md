<!-- BEGIN: AVLpoint Database Strategy -->
# Database Migration Strategy

**CRITICAL DIRECTIVE**: AVLpoint is currently running on SQLite for data ingestion. However, the moment the user requests to start building the Web Frontend, UI, or public-facing API, the **ABSOLUTE FIRST PRIORITY** is to migrate the database from SQLite to Supabase (PostgreSQL + pgvector).

Do not build web features or multi-tenant APIs against the SQLite database. Prompt the user to execute the Supabase migration script first to ensure scalability, RLS security, and hybrid vector search are in place.
<!-- END: AVLpoint Database Strategy -->
