# AVLpoint Admin Platform — Specification (as built)

_Last updated 2026-07-16. This spec describes the implemented system, not a proposal.
Where a feature is future work it is explicitly marked **[Later]**._

---

## 1. What AVLpoint is

AVLpoint is a vendor-intelligence platform for industrial fabrication sourcing. A Python
discovery pipeline continuously scrapes and AI-enriches manufacturer/fabricator records
(93,000+ companies, 14 sources, 86 columns) into `vendors.db` (SQLite, WAL). The Next.js 16
site sells that intelligence to three personas:

| Persona | What they do | Where |
|---|---|---|
| **Enterprise** (buyer) | Search the directory, build a private AVL "sandbox" (upload their own vendor lists), request audits, analyze meetings | `/search`, `/sandbox`, `/meetings` |
| **Vendor** | Claim their scraped profile (Trust Ladder), enrich it first-party | `/claim`, `/vendors/[id]` |
| **Inspector** | Apply to the marketplace, receive inspection jobs, file reports that issue Level 1 certifications | `/inspections` |

**Core entities:** `vendors` (pipeline-owned), `users`, `orgs` + `org_members` (enterprise
workspaces), `private_vendors` (org-scoped uploads), `inspectors`, `inspection_requests` +
`inspection_reports`, `site_certifications`, `vendor_claims`, `vendor_owners`,
`saved_vendors`, `removal_requests`, plus admin infrastructure: `sessions`, `vendor_states`,
`login_attempts`, `invitations`, `admin_notes`, `admin_actions` (audit).

**Table ownership contract:** the pipeline owns `vendors`, `vendors_fts`, `certifications`,
`seen_urls`, `url_cache` — the website NEVER alters their schema. Everything the site needs
is layered on in site-owned tables (this is why sleep state is an overlay table).

**Top admin responsibilities (day-to-day):**
1. Curate the vendor database — approve/reject lifecycle, edit fields/keywords, sleep bad records.
2. Review queues — profile claims, inspector applications, audit requests, privacy removals.
3. Run access — create/invite users, assign roles, disable accounts, reset passwords, kill sessions.
4. Operate enterprise workspaces and the inspection network.
5. Watch the audit log; run backups.

---

## 2. What was wrong before (audit of the old admin)

| Finding | Severity | Status |
|---|---|---|
| `admin/admin` hardcoded login in `loginAction` | Critical | **Removed** — no code path mints an admin session without a DB account |
| Hardcoded fallback admin email in `isAdminSession` | Critical | **Removed** — staff = DB role only |
| Weak/committed `AUTH_SECRET` with dev fallback usable in prod | Critical | **Rotated**; prod now refuses weak/missing secrets at boot |
| JWT-only sessions — no revocation, role baked into token for 7 days | High | **Replaced** with server-side session rows; role read live per request |
| No rate limiting on login | High | **Added** — 5 fails/account, 25/IP per 15 min |
| Flat roles (`buyer`/`vendor`/`admin`), both real users were `buyer` | High | **RBAC** with 6 roles × 20 permissions |
| No sleep state; only hard delete; "disqualified" vendors still appeared in public search | High | **vendor_states overlay** + every public query filtered |
| No user management, no invitations, no password reset | High | **Built** (`/admin/users`, `/invite/[token]`) |
| No enterprise/inspector admin surfaces | Medium | **Built** |
| No route-level guard (layout-only auth) | Medium | **`src/proxy.ts`** edge gate on `/admin/*` + `/api/admin/*` |
| Audit log vendor-only | Medium | **Generalized** (`entity_type`/`entity_id`, auth events included) |
| No backups from the app | Medium | **Built** — online backup API + external mirror + restore runbook |

---

## 3. Authentication & authorization

### Sessions
- Cookie `avl_session`: httpOnly, SameSite=Lax, Secure in prod. JWT (HS256) carrying only
  `sub` (user id), `jti` (session row id), and a non-authoritative `role` hint for the proxy.
- Every request: verify JWT → check `sessions` row (not revoked, not expired) → load user row
  (live role + status). Deduplicated per render via React `cache()`.
- Staff sessions last 24 h; customer sessions 7 days.
- Revocation surfaces: password change (keeps current session), admin "Revoke sessions",
  disable account, staff role change (all sessions killed).
- `AUTH_SECRET` must be ≥32 chars and not a known default — production throws at boot otherwise.

### Login protection
- `login_attempts` table; lockout after 5 failures/account or 25/IP in 15 min, with
  retry-after messaging. Success clears the account's failures. Dummy bcrypt compare
  equalizes timing for unknown emails. All attempts audit-logged
  (`auth.login`, `auth.login_failed`, `auth.login_blocked_disabled`).

### Defense in depth (three gates)
1. `src/proxy.ts` (Next 16 proxy, edge): no valid token → `/login?next=…`; non-staff role
   hint → `/dashboard`. Cheap, non-authoritative.
2. `admin/layout.tsx`: authoritative session check (live DB role), forces password change
   when flagged.
3. Every server action + API route re-checks its **specific permission** — the UI hiding a
   button is never the security boundary.

### Break-glass
`node scripts/create-admin.mjs <email> [--role …] [--reset-password]` — requires server
shell, prints a one-time temp password, forces change at first login, writes an audit row.
This replaces every backdoor.

### RBAC (`src/lib/rbac.ts`)
Two planes:
- **Staff plane** — permission matrix below.
- **Tenant plane** — buyer/vendor/inspector capabilities come from ownership rows
  (`org_members`, `vendor_owners`, `inspectors.user_id`), never from the matrix.

| Permission | super_admin | admin (ops) | support | buyer/vendor/inspector |
|---|:-:|:-:|:-:|:-:|
| admin.access | ✅ | ✅ | ✅ | — |
| vendors.view | ✅ | ✅ | ✅ | — |
| vendors.edit / lifecycle / sleep / export | ✅ | ✅ | — | — |
| vendors.delete (hard) | ✅ | — | — | — |
| users.view | ✅ | ✅ | ✅ | — |
| users.manage / users.invite | ✅ | ✅ | — | — |
| staff.manage (grant/revoke staff roles) | ✅ | — | — | — |
| orgs.view | ✅ | ✅ | ✅ | — |
| orgs.manage | ✅ | ✅ | — | — |
| inspectors.view | ✅ | ✅ | ✅ | — |
| inspectors.manage | ✅ | ✅ | — | — |
| audit.view / settings.view | ✅ | ✅ | ✅ | — |
| notes.write | ✅ | ✅ | — | — |
| backups.run | ✅ | ✅ | — | — |

Hard rules enforced in the data layer (not the UI): no self role-change or self-disable;
only super_admin touches staff accounts (create, role, disable, reset); the **last active
super_admin can never be demoted or disabled**.

The user's prompt-roles map as: "vendor admin" = vendor who passed a claim
(`vendor_owners`), "enterprise admin" = `org_members.role='admin'`, "inspector manager" =
staff with `inspectors.manage`.

---

## 4. Sleep system (reversible disable) — the non-negotiable

### Data model
```sql
CREATE TABLE vendor_states (          -- site-owned overlay; vendors table untouched
  vendor_id  INTEGER PRIMARY KEY,
  state      TEXT NOT NULL DEFAULT 'sleeping',
  reason     TEXT,
  changed_by TEXT,                    -- staff email
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
- **Sleep** = upsert row with `state='sleeping'`. **Wake** = delete the row. No vendor data
  is ever copied, mutated, or lost — waking is lossless by construction.
- Users: `users.status` (`active`/`disabled`) — disable blocks login + revokes sessions.
- Orgs: `orgs.status` (`active`/`sleeping`) — members keep accounts; workspace **writes**
  (upload, add member, audit request) are blocked; reads stay.
- Inspectors: `inspectors.status` gains `suspended` — vanishes from the public marketplace
  (`listInspectors(true)` filters), history kept, reinstate restores.

### Query contract
`awakeSql(alias)` in `src/lib/states.ts` returns
`NOT EXISTS (SELECT 1 FROM vendor_states vst WHERE vst.vendor_id = <alias>.id AND vst.state='sleeping')`
and is applied to **every** user-facing read:
`searchVendors` (FTS + LIKE + browse), `getVendorById` (profile → 404), `getSimilarVendors`,
`getFeaturedVendors`, `getStats`, `getFacets`, `getSavedVendors`, `/api/search`,
`/api/recommend` (via searchVendors). Admin queries instead SELECT a computed `sleeping`
flag and accept a `sleepState` filter (`awake`/`sleeping`).

### Verified end-to-end (2026-07-16)
Sleep vendor #5377330 → public FTS search returned 0 results, `/vendors/5377330` returned
404 → wake → search returned it again with all data intact. Both transitions audit-logged
with actor, reason, timestamp.

---

## 5. Screen-by-screen feature spec

**IA / sidebar (permission-filtered per role):**
```
/admin              Dashboard        admin.access
/admin/vendors      Vendors          vendors.view      (+ /admin/vendors/[id] editor)
/admin/approval     Approval Queue   vendors.view
/admin/bulk         Bulk Operations  vendors.lifecycle
/admin/users        Users & Roles    users.view        (+ /admin/users/[id] detail)
/admin/enterprises  Enterprises      orgs.view
/admin/inspectors   Inspectors       inspectors.view
/admin/audit        Audit Log        audit.view
/admin/export       Export           vendors.export
/admin/settings     Settings         settings.view
Public: /invite/[token] (accept invitation) · /settings (self-serve password change)
```
Shell: fixed sidebar ≥1024px with active-route highlight + role badge; slide-over drawer
below (verified at 375px).

- **Dashboard** — stat cards (total / tiers / **sleeping** / accounts), lifecycle + tier
  distributions, top countries/types, recent audit activity, and four queues: profile
  claims (approve→`vendor_owners`), inspector applications, audit requests, privacy removals.
- **Vendors** — FTS search over 93k rows; filters: tier, lifecycle, completeness, website,
  email, **awake/sleeping**, sort; multi-select with bulk approve/reject/**sleep/wake**;
  per-row quick actions (edit, approve, reject, sleep/wake); sleeping rows struck through
  with a moon marker; pagination.
- **Vendor editor** — visibility panel (sleep with reason / wake, shows who/when/why while
  asleep), full field editor (scalars, JSON arrays, booleans — allowlisted columns only),
  lifecycle controls, type-DELETE-to-confirm hard delete (super admin), internal notes.
- **Approval queue** — kanban-style lifecycle review (pre-existing, now permission-gated).
- **Bulk operations** — filter → **preview count + sample** → choose action
  (**Sleep [recommended]**, disqualify, hard delete, add/remove keyword) → type the exact
  match count to execute. Filter-based sleep batches 1,000 ids per transaction to keep locks
  short next to the writing pipeline; capped at 20k per run.
- **Users & Roles** — searchable account list (role/status filters, session counts, last
  sign-in); create account (temp password shown once, forced change); invite by link
  (single-use, 7-day, role pre-assigned, revocable, pending list); staff-role options
  visible to super admin only.
- **User detail** — tenant links (workspace, owned vendor profiles), role change, disable/
  re-enable, reset password, revoke sessions, active session list (IP/UA/expiry), internal
  notes, account history from the audit log. Self-administration blocked with pointer to
  /settings.
- **Enterprises** — workspace cards (owner, members, private-vendor + audit-request counts),
  sleep/wake workspace, add member, white-glove create (owner must already have an account),
  audit-request queue.
- **Inspectors** — roster with approve/suspend/reinstate (house team protected), inspection
  pipeline overview (status, quote, schedule), Level 1 certifications with revoke.
- **Audit log** — every event with actor, action, entity type, target (linked), details
  preview; filters: entity type, action type, actor; paginated.
- **Export** — CSV/JSON with filters incl. awake/sleeping (permission: vendors.export —
  support role deliberately excluded).
- **Settings & Safety** — live security posture (secret strength, no-default-credentials,
  super-admin coverage, active sessions, failed logins 24h, audit count); **Run backup now**
  (SQLite online backup API — verified: 191.6 MB in ~1 s while the pipeline writes, mirrored
  to `BACKUP_EXTERNAL_DIR`), backup list, restore runbook (deliberately manual), break-glass
  instructions.

---

## 6. User stories (representative, all implemented unless marked)

**Enterprise**
- As an enterprise user I sign up, create a workspace, upload my vendor list into a private
  sandbox, and search the 93k directory — I never see slept vendors anywhere.
- As a workspace admin I add teammates by email; if our workspace is slept for non-payment I
  can still read my data but writes are paused until ops wakes it.
- **[Later]** As an enterprise admin I manage per-seat roles beyond admin/member.

**Vendor**
- As a vendor I claim my company with a work email; an ops admin approves it and I can
  enrich my profile first-party.
- As a vendor whose record is wrong, my privacy request lands in the dashboard queue; ops
  can sleep my record instantly (reversible) while it's investigated.

**Inspector**
- As an inspector I apply with credentials; staff approve me into the marketplace; jobs move
  requested → quoted → scheduled → in progress → passed/failed; a pass auto-issues a 1-year
  Level 1 certification. If I go rogue, staff suspend me (hidden immediately) and can revoke
  my certifications.

**Staff**
- As the owner (super admin) I create an ops admin who can run vendor curation but can
  neither hard-delete vendors nor mint new staff.
- As support I can see everything and change nothing — every mutation path rejects me
  server-side.
- As any staff member, everything I do is attributable in the audit log, and I can prove
  what happened to any record from its detail page.

---

## 7. Build plan

**Phase 0–6 (done, in this order — each unlocked the next):**
1. Schema bootstrap in `db.ts` (busy_timeout; new tables; idempotent ALTERs) — everything
   depends on tables existing before first query.
2. Auth core: revocable sessions, RBAC, lockout, backdoor removal, proxy, break-glass CLI,
   secret rotation — nothing else is trustworthy until identity is.
3. Sleep overlay + user-facing query filtering (the non-negotiable, isolated data-layer change).
4. Permission gates + sleep/wake server actions + generalized audit.
5. Users/invitations/password-change surfaces.
6. Enterprises + inspectors surfaces; responsive shell; bulk/audit/settings/backup tooling.

**Next, in priority order [Later]:**
1. Email delivery for invitations + password resets (currently link/temp-password handed by admin).
2. Scheduled backups (Windows Task Scheduler → `create-admin.mjs`-style Node script) + retention policy.
3. Sleep TTL ("wake automatically on date") — schema already tolerates extra columns.
4. Audit-log CSV export + retention window.
5. 2FA (TOTP) for staff accounts.
6. Per-org seat roles; org-scoped API keys for the Enterprise API.
7. CSV import for vendors (admin-side, into a staging table with review).

---

## 8. Security checklist (state at ship)

- [x] No default or hardcoded credentials anywhere; break-glass requires shell access
- [x] Passwords bcrypt (cost 12 staff/new, 10 legacy); 10-char minimum on new/changed
- [x] Sessions: httpOnly + SameSite cookie, server-side rows, revocable, role read live from DB
- [x] Forced password change on admin-issued credentials
- [x] Login throttling per-account and per-IP, timing-equalized compares
- [x] RBAC enforced in every server action and API route (never UI-only)
- [x] Last-super-admin lockout protection; no self-demotion/self-disable
- [x] Proxy gate on `/admin/*` and `/api/admin/*` (defense in depth)
- [x] Audit trail for auth events, all mutations, sleeps/wakes, role changes, backups
- [x] Destructive actions: sleep is the default path; hard delete is super-admin-only with
      type-to-confirm; bulk ops require typing the exact match count
- [x] SQL: prepared statements throughout; editable columns allowlisted; FTS input sanitized
- [x] Secrets: AUTH_SECRET rotated (invalidated all prior sessions); prod boot refuses weak secrets
- [x] Backups: on-demand online backup + external mirror + documented restore
- [ ] [Later] 2FA for staff; email verification; CSP headers pass; audit retention policy

---

## 9. Operational notes

- The discovery pipeline writes to `vendors.db` continuously. All site writes are short
  transactions with `busy_timeout=5000`; bulk sleeps batch at 1,000 rows. Never ALTER
  pipeline tables (`vendors`, `vendors_fts`, `certifications`, `seen_urls`, `url_cache`).
- Site inspection certifications live in **`site_certifications`** — the pipeline owns the
  `certifications` name with a scraped-data schema (discovered during E2E; the site tables
  were renamed, pipeline untouched).
- Rotating `AUTH_SECRET` logs everyone out by design. Restart the dev server after changing
  `.env` — the Settings page posture card turns red if a weak/old secret is still loaded.
- Verification account `verify-admin@avlpoint.dev` was created for E2E testing and left
  **disabled**; re-enable from /admin/users or delete at will. Your own account
  (alexanderbohdal6@gmail.com) is **super_admin** — sign in with your existing password.
