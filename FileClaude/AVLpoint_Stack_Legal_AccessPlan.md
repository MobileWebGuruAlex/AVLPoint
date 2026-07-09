# AVLPOINT — STACK DECISION, LEGAL FINDINGS & ACCESS-TIER GAME PLAN
**July 2026 · Confidential · Not legal advice — validate with a licensed attorney before launch**

---

# PART 1 — THE STACK DECISION

## Option A (RECOMMENDED): Supabase + Vercel + Claude
| Layer | Tool | Why |
|---|---|---|
| Database + Auth + Storage | **Supabase** (Postgres) | Row Level Security enforces your access tiers *at the database level* — even a bug in app code can't leak gated data. Built-in pgvector = AI search with no extra vendor. SOC 2 Type II + HIPAA certified as of Feb 2026. |
| Hosting | **Vercel** | First-class Next.js hosting; your site appears to already be Next.js (localhost:3000). Zero migration. |
| AI brain | **Claude API** | Matching, explanations, AVL document/photo parsing, meeting analysis. |
| Cheap AI tasks | Gemini Flash or Claude Haiku | Tagging, autocomplete — pennies. |
| Transcription | AssemblyAI / Deepgram | Meeting recorder. |
| Payments | Stripe + Stripe Connect | Subscriptions + inspection marketplace fee splits. |

**Why this wins for AVLpoint specifically:**
1. **Your entire business model is access tiers.** Postgres RLS is the industry-standard way to enforce "anonymous sees names only / verified sees profiles / org A never sees org B's sandbox." Firebase's Security Rules get unwieldy for exactly this kind of complex multi-tenant permission scheme.
2. **Cost at scale:** ~10K daily users costs roughly $50–100/mo on Supabase vs $500–1,500/mo on Firebase's per-operation billing. Your search-heavy directory is precisely the read-heavy workload Firebase punishes.
3. **AI-ready:** pgvector gives you semantic search inside the same database — no separate vector DB to sync.
4. **No lock-in:** it's standard Postgres; you can take the database anywhere. Firebase migrations off-platform typically run $15–30K.

## Option B: Google all-in (Firebase + Gemini + Cloud)
Firebase Auth + Firestore/Data Connect + Firebase Hosting + Gemini via Firebase AI Logic.
- **Pros:** one vendor, polished console, first-party Gemini access, great mobile SDKs, FedRAMP-grade compliance ecosystem.
- **Cons:** per-read billing punishes a search-heavy directory; NoSQL fights your deeply relational data (vendors ↔ certs ↔ inspections ↔ orgs ↔ claims); multi-tenant security rules are harder to get right; vendor lock-in.
- **Verdict:** Google's ease-of-integration reputation is real for mobile apps — but for a relational, multi-tenant, search-heavy SaaS, it's the more expensive and harder path. If you ever build a heavy offline-first mobile field app, Firebase can be added *just for that*.

## Option C: Hybrid (viable, adds complexity)
Supabase as the database + Firebase Auth or Clerk for authentication + any LLM. Only worth it later if enterprise customers demand SAML SSO/SCIM — at that point bolt on **WorkOS or Clerk** for enterprise auth rather than replatforming.

**Model strategy regardless of option:** keep the LLM behind one config constant. Claude for reasoning-heavy work (matching explanations, document parsing), a budget model for high-volume trivia. You're never married to either vendor.

---

# PART 2 — LEGAL RESEARCH FINDINGS (the real answers)

Your instinct is right: you cannot just throw this data open. But the reasons — and the fixes — are probably different than you think. Four issues matter:

## 2.1 Your scraped data: mostly defensible, with rules
- U.S. courts (hiQ v. LinkedIn line of cases, reaffirmed through Meta v. Bright Data, 2024) have held that scraping **publicly available** data without breaking technical barriers or logins is not a federal CFAA violation. Collecting from public directories, certification registries, government sources (EPA ECHO, OpenCorporates) is the **lowest-risk** category.
- BUT: sites can still enforce **their terms of service** against scrapers via breach-of-contract claims (that's how LinkedIn ultimately beat hiQ). Sources like ThomasNet have terms prohibiting bulk extraction. Risk mitigation: prioritize open-data and government sources, respect robots.txt, keep provenance records (you already do — huge advantage), and never scrape behind logins or via fake accounts (that's where real liability lives).
- **Flip side — protect YOURSELF the same way:** your Terms of Service must expressly prohibit scraping/bulk export of the AVLpoint database, and your tiered login gate is the *technical barrier* that makes that enforceable. Your access-tier plan isn't just monetization — it's your legal moat.

## 2.2 Contact data is "personal information" — this is the big one
- California's CCPA B2B exemption **expired Jan 1, 2023**. A person's work email, direct phone, and job title are now protected personal information for California residents. Penalties run ~$2,663 per unintentional violation, ~$7,988 per intentional one — *per record* — and enforcement is active ($2.75M Disney settlement, $1.35M Tractor Supply).
- If AVLpoint sells/shares individuals' contact data, you likely qualify as a **data broker** in California (registration required) and must honor opt-out and deletion requests.
- GDPR applies to any EU person's data (your database includes Polish, Taiwanese, Canadian vendors...) — "publicly available" does NOT mean freely processable in the EU; you need a documented lawful basis (legitimate interest works for B2B, with transparency and opt-out).
- **Practical design decisions this forces:**
  1. Prefer **company-level** data (name, capabilities, certs, location, company phone/website) — minimal personal-data risk — over **person-level** data (named individuals' direct emails/cells), which carries the compliance burden.
  2. Gate any person-level contact details behind paid, logged, terms-bound accounts.
  3. Build day one: privacy policy, a "Do Not Sell/Share My Info" + removal request page, an opt-out workflow, and deletion capability per record.
  4. The **claim flow converts risk to asset**: once a vendor claims and enriches their own profile, that's first-party, consented data — the gold standard. Every claim de-risks a record.

## 2.3 Verification claims = liability if sloppy
When you stamp "Verified" or "Level 1 Certified," enterprises rely on it. Protect yourself with: clear written definitions of what each badge does and doesn't attest, dated certifications with expiry, disclaimers that certification is point-in-time and not a guarantee of performance, and E&O (errors & omissions) insurance before the inspection business scales. Also keep the transparency rule: paid placement always labeled.

## 2.4 Export-control awareness (edge case, cheap to handle)
If enterprise sandboxes ever hold ITAR/defense-related vendor data, that's the customer's data in an isolated tenant — fine — but don't market AVLpoint as an ITAR-compliant environment until you actually certify it. One sentence in enterprise terms handles it.

---

# PART 3 — THE ACCESS-TIER ARCHITECTURE (your spec, formalized)

Exactly the ladder you described, now with the legal rationale attached and enforced by RLS:

| Tier | Who | Can see / do | Enforced by |
|---|---|---|---|
| **T0 — Anonymous** | No account | Search runs; sees **result counts + company names only**. Everything else blurred with "create a free account" prompt. | RLS: anonymous role gets `name, tier_badge` columns only. Blurred UI is marketing; RLS is the real wall. |
| **T1 — Registered (free)** | Verified email or phone (OTP) | Full search of company-level profiles. No exports, no person-level contacts, rate-limited. Accepts ToS (anti-scraping contract). | Supabase Auth + RLS `authenticated` role. Rate limits + bot detection stop bulk harvesting. |
| **T2 — Vendor (paid)** | Claimed/new listing, $299–499/mo | Everything in T1 + claim & enrich profile, analytics, lead inbox, cert wallet, Trust Ladder progression. | `vendor_owner` role scoped to their own record. |
| **T3 — Inspector (vetted + paid)** | Credential-reviewed inspection companies | Marketplace listing, job pipeline, field app, report issuance. Manual admin approval — badge integrity depends on it. | `inspector` role + admin approval flag. |
| **T4 — Enterprise (paid seats)** | Organizations | Private sandbox, AVL ingest, combined search, gap analysis, meeting recommender, exports, API. | Org-scoped RLS: `org_id` on every private row. Org A can never query Org B. |
| **T5 — Admin** | You & JB | Claim review queue, inspector vetting, opt-out/deletion handling, provenance audit. | `service_role`, never exposed client-side. |

Extra rules that matter: person-level contact data (if you keep any) visible only at T2+; every export watermarked with the account ID (deters resale); audit log on all profile views at enterprise tier (compliance selling point).

---

# PART 4 — THE GAME PLAN

**Week 1–2 — Foundation**
1. Confirm the site's backend; stand up Supabase project; define roles + RLS policies for T0–T5 (this is the single highest-leverage build).
2. Ship the T0/T1 gate: anonymous = names + counts, free account (email/phone OTP) = full company profiles.
3. Publish ToS (anti-scraping clause), Privacy Policy, and a working "Request removal / Do Not Sell" page.

**Week 3–6 — Revenue on**
4. Vendor claim flow + Stripe billing (T2). Every claim = revenue + consented data.
5. Data hygiene pass: separate company-level vs person-level fields; suppress person-level from public display.

**Week 7–12 — Enterprise + AI**
6. Org accounts + sandbox with RLS isolation (T4), AVL ingest (spreadsheet/PDF/photo via Claude), combined labeled search on pgvector.

**Week 13–20 — Trust economy**
7. Inspector vetting + marketplace (T3), Stripe Connect fee splits, field checklist app, Level 1 badge issuance.

**Week 21+ — The showstopper**
8. Meeting recorder → recommendations, gap-analysis reports, alerts, API.

**One-time spends:** ~1 hour with a privacy attorney to bless the ToS/privacy policy (~$500–1,500) and E&O insurance quote before inspections scale. Cheap insurance against the only risks that could actually hurt you.
