# AVLPOINT.COM — MASTER PLAN
### Branding · Business Plan · Feature Roadmap · AI Strategy · Build Prompts
**Prepared for Alex & JB · July 2026 · Confidential**

---

# PART 1 — BRAND IDENTITY

## 1.1 The Name

**AVLpoint** — the single point where every Approved Vendor List connects. The name does three jobs at once: it says what we work on (AVLs), it says what we are (the point of connection, the point of truth, the point of verification), and it's short, spellable, and ownable.

**Master positioning line:**
> **"The fabric of industrial commerce."**
> AVLpoint is where the biggest companies in the world and the best small shops in the world finally find each other.

**Tagline options (pick one primary, one for enterprise, one for vendors):**
- **Primary:** *"Every vendor. Verified. One point."*
- **Enterprise:** *"Your AVL, finally searchable."*
- **Vendor-facing:** *"Get seen. Get verified. Get hired."*
- **Alternates:** "The point where big meets small." / "Approved. Verified. Connected." / "One point of truth for every approved vendor."

## 1.2 Brand Story (use on About page, pitch deck, sales emails)

For decades, the world's biggest operators — chemical plants, refineries, food and pharma manufacturers — have kept their approved vendors locked in PDFs and spreadsheets nobody can search. Meanwhile, thousands of elite small fabricators and inspection shops are invisible to the buyers who need them most. AVLpoint is the fabric that weaves these two worlds together. Enterprises get an AI agent that instantly searches their own vendor lists plus our verified network. Vendors get a claimed, certified profile that puts them in front of Fortune 500 buyers. And trust is built in — because no vendor reaches full certification without an independent inspection. Big meets small. Demand meets supply. At one point.

## 1.3 Visual Identity

**Color palette:**
| Role | Color | Hex | Use |
|---|---|---|---|
| Primary | Deep Industrial Navy | `#0E2A47` | Headers, nav, trust surfaces |
| Secondary | Steel Slate | `#3E5871` | Cards, secondary UI |
| Accent 1 | Signal Amber | `#F5A623` | CTAs, "Verified" badges, the "point" |
| Accent 2 | Verification Green | `#1DB87A` | Level 1 Certified status, success states |
| Neutral | Off-White | `#F7F8FA` | Backgrounds |
| Neutral Dark | Graphite | `#1C1F24` | Body text |

Rationale: navy + steel = industrial trust and enterprise credibility (procurement and compliance people must feel safe). Amber = the literal "point" — a single glowing point of connection used in the logo, loading states, and badges. Green is reserved exclusively for verification status so certification instantly reads at a glance.

**Logo direction:**
- Wordmark "AVL**point**" with the "point" in amber, and the dot of an "i"-style point rendered as a glowing node.
- Icon: a single amber node with thin connecting lines radiating to smaller nodes — big node meets small nodes — reading as both a network hub and a literal "point." Works at favicon size.
- Badge system derived from the icon: **Claimed** (gray outline node), **Verified Member** (amber node), **Level 1 Certified** (green node with checkmark ring). These badges are a marketing asset in themselves — vendors will put them on their own websites, which is free advertising for us.

**Typography:** Inter (UI + body), Space Grotesk or Archivo (headlines) — modern, technical, not corporate-stale.

**Voice:** Confident, plain-spoken, credible. We talk like the trusted inspector on site, not like a Silicon Valley pitch. Short sentences. Proof over hype. Every AI recommendation shows its reasoning — the brand voice mirrors that transparency.

## 1.4 The Trust Ladder (core brand + product concept)

This is the heart of what you described on the call. Every vendor on AVLpoint sits on a visible ladder:

1. **Listed** — in our database (from the data we've been building). Basic card.
2. **Claimed** — the company registered, claimed their card, and enriched it (capabilities, certs, photos, capacity, service area).
3. **Verified Member** — documents checked (insurance, business registration, stated certifications matched to issuing bodies).
4. **Level 1 Certified** — passed an on-site inspection, performed either by **us (FTG/AVLpoint Inspections)** or by an **approved third-party inspection company** listed in our Inspection Marketplace.

Why this is brilliant business design: the ladder gives vendors a reason to pay (each rung = more visibility in AI search results), gives enterprises a reason to trust, and creates the inspection revenue stream twice — once when we do the inspection, and again as a marketplace fee when a third-party inspector does it.

---

# PART 2 — BUSINESS PLAN (UPDATED FOR AVLPOINT)

Everything from the Attestra business plan carries over with the new name. Key updates from your latest direction:

## 2.1 What's new since the June plan

1. **The Inspection Marketplace** (new, fourth revenue stream). Other inspection companies can list on AVLpoint and be hired to certify vendors. We take a percentage (suggest 15–20%) of every marketplace inspection, and we keep 100% when the client picks us. This turns potential competitors into paying partners and lets certification scale far beyond what JB can personally inspect.
2. **Enterprise Sandboxes.** Every enterprise account gets a private, isolated workspace where they upload their own AVL in ANY form — spreadsheet, PDF, scan, even a photo of a printed list. AI parses it into structured data. Their private vendors and our public network are searched together, with results clearly labeled: *Already on your AVL (approved)* vs. *AVLpoint Network (verified, not yet on your list)* — and one click requests an audit to onboard a network vendor onto their AVL.
3. **The Meeting Recorder.** Record a project meeting in the app; at the end, hit one button and the AI returns the recommended vendors for everything discussed — with reasons. This is the demo that closes enterprise deals. Nobody else has it.

## 2.2 Revenue streams (updated)

| # | Stream | Who pays | Indicative price | Notes |
|---|---|---|---|---|
| 1 | Enterprise SaaS | Operators | $2,500–$5,000 / mo | Sandbox + agent + meeting recorder |
| 2 | Vendor Network | Fabricators/vendors | $299–$499 / mo | Claimed + verified profile, AI visibility |
| 3 | Audit & Onboarding | Enterprise or vendor | $5,000–$25,000 / job | Level 1 certification by us |
| 4 | Inspection Marketplace | Third-party inspectors | 15–20% of job fee | NEW — scales certification beyond us |

All pricing to be validated in customer discovery. The rest of the plan — market size ($13–14B SRM software market, ~10–12% CAGR), the moat (proprietary enterprise data + two-sided network), competitive landscape (SAP Ariba/Oracle/Coupa weak in regulated fabrication) — stands as written in the June document.

## 2.3 One thing to protect (compliance note)

Keep the recommendation transparency rule from the original plan: paid network placement must always be **clearly labeled**. In procurement, hidden pay-for-placement can be construed as improper inducement and it kills enterprise trust instantly. Transparency is the moat, not a limitation. Same logic applies to the Inspection Marketplace — an enterprise must always be able to choose ANY approved inspector, including ones that aren't us, and the AI must never steer toward us without saying so.

---

# PART 3 — FEATURE ROADMAP & PHASES

You have: the database (built), a v1 website (built). Here's the path from website → full SaaS platform.

## Phase 1 — Foundation & Vendor Side (Weeks 1–6)
- Migrate/confirm stack: **Next.js + Supabase (Postgres, Auth, Storage, pgvector) + Vercel**. If the current site isn't on this stack, port it now — everything later depends on it.
- Vendor cards live from the database; public directory with filters (capability, certification, location, capacity).
- **Claim Your Company** flow: search → claim → email/phone verification → edit profile → upload docs/photos.
- Trust Ladder badges (Listed → Claimed → Verified) rendered on every card.
- Stripe billing for vendor memberships.
- Apply the full brand scheme (Part 1) across the site.

## Phase 2 — AI Search Core (Weeks 6–12)
- Embed every vendor profile into pgvector (Supabase's built-in vector search).
- Natural-language search box (typed AND voice via browser speech-to-text): "I need a shop that can fabricate a 5,000-gallon zinc-lined pressure vessel in the Gulf region."
- RAG pipeline: query → retrieve candidates from vector DB → Claude ranks and **explains why** each vendor was recommended → results labeled by trust level.
- Search works for anonymous visitors (limited results, lead capture) and full for members.

## Phase 3 — Enterprise Sandboxes (Weeks 12–20)
- Org accounts with per-customer data isolation (Supabase Row Level Security — non-negotiable).
- **AVL Ingest:** upload spreadsheet/PDF/scan/photo → Claude's vision + document parsing extracts vendors into structured records → human-review screen → merged into the org's private index.
- Combined search: private AVL + AVLpoint network in one query, clearly labeled, with "already approved" vs. "recommended — request audit" states.
- One-click **Request Audit** → routes to Stream 3/4.

## Phase 4 — Inspection Marketplace + Level 1 Certification (Weeks 18–26, overlaps 3)
- Inspector onboarding: profiles, credentials, coverage areas, pricing.
- Certification workflow: request → quote → schedule → inspection checklist app (mobile-friendly, photo evidence) → pass/fail → Level 1 badge issued with expiry date → renewal reminders.
- Marketplace payments with platform fee via Stripe Connect.

## Phase 5 — The Meeting Recorder (Weeks 24–32)
- In-app recording (or upload a recording) → transcription → hit **"Get Recommendations"** → Claude extracts every need mentioned in the meeting → runs matching against the sandbox + network → returns a report: needs identified, vendors recommended per need, reasoning, trust level, and a downloadable branded PDF/PowerPoint.
- This is the flagship demo. Build a canned sample meeting for sales demos on day one of this phase.

## Phase 6 — Scale & Polish (Months 8–12)
- Named personal agents per user (the Attestra "meet your agent" concept), saved searches, alerts when a matching vendor gets certified, analytics dashboards for vendors (profile views, search appearances), API access for enterprise ERP integration.

**Realistic total timeline: 8–12 months to full platform, with revenue possible from Phase 1 (vendor memberships) at ~6 weeks.** Building solo with AI tools (Cursor + Claude), expect the fast end if you work it consistently; the slow end if it's nights-and-weekends.

---

# PART 4 — THE AI DECISION: CLAUDE vs GEMINI vs OTHER

**Recommendation: Anthropic Claude API as the brain, with a small supporting cast. Here's the honest breakdown:**

| Need | Best tool | Why |
|---|---|---|
| Vendor matching, reasoning, explaining recommendations | **Claude (Sonnet class)** | Best-in-class at nuanced reasoning + explaining itself; long context handles big AVLs; strong tool-use for querying your DB |
| Parsing messy AVLs (PDFs, scans, photos) | **Claude vision + PDF support** | Reads documents and images natively; one vendor for parse + reason simplifies everything |
| Meeting transcription | **AssemblyAI or Deepgram** (~$0.15–0.35/hr) | Purpose-built speech-to-text beats using an LLM for this; cheap, accurate, speaker labels |
| Vector search | **Supabase pgvector** | Free with your database, no extra vendor |
| Embeddings | **Voyage AI or OpenAI embeddings** | Cheap ($0.02–0.13 per 1M tokens), plug into pgvector |
| High-volume cheap tasks (autocomplete, tagging) | **Claude Haiku or Gemini Flash** | Pennies per thousand calls |

**Why Claude over Gemini as the core:** your product's differentiator is *trustworthy, explained recommendations to compliance-minded enterprise buyers*. Claude is consistently strongest at careful reasoning, following complex instructions (like "always label network vendors as sponsored"), and long-document work. Gemini Flash is a great budget option for low-stakes tasks and you can absolutely mix both — the architecture below makes the model swappable, so you're never locked in.

**Why not "a free one":** open-source models (Llama etc.) mean you host and maintain GPU infrastructure — wrong fight for a solo builder. API pricing is usage-based and tiny at your early scale.

**Estimated AI costs at early scale (50 enterprise seats, 500 vendors, moderate usage): roughly $200–$800/month.** At that spend you'd be generating $30K+ MRR if the pricing model holds. AI cost is not your problem; distribution is.

**Architecture in one sentence:** Next.js app → Supabase (auth, Postgres, RLS-isolated org data, pgvector, file storage) → a thin API layer that calls Claude with retrieved context (RAG) → responses always grounded in YOUR database, never the model's memory — which is what keeps recommendations accurate and defensible.

---

# PART 5 — COPY-PASTE BUILD PROMPTS

Use these in Cursor (or Claude Code) one phase at a time. Each assumes the previous phase exists. Before each one, tell the tool: *"First inspect the existing codebase and confirm the current stack and file structure before changing anything. Do not rewrite working code."*

## Prompt 1 — Brand system + vendor directory
```
You are working on avlpoint.com, a B2B platform connecting enterprise buyers with
verified industrial vendors. Apply this brand system site-wide as design tokens:
Navy #0E2A47 (primary), Steel #3E5871, Amber #F5A623 (CTAs + "point" accents),
Green #1DB87A (verification only), Off-white #F7F8FA, Graphite #1C1F24 text.
Fonts: Space Grotesk headlines, Inter body. Style: premium industrial-enterprise,
generous whitespace, subtle motion, never cartoonish.

Build a public vendor directory: card grid from the Supabase `vendors` table,
filters for capability, certification, state/region, and trust level. Each card
shows name, capabilities, location, and a trust badge (Listed / Claimed /
Verified / Level 1 Certified — gray, amber outline, amber solid, green
respectively). Card click opens a full vendor profile page with SEO-friendly
slug URLs. Mobile-first, fast, accessible.
```

## Prompt 2 — Claim-your-company flow
```
Build a "Claim Your Company" flow on avlpoint.com using Supabase Auth.
Flow: user searches the vendor directory → clicks "Claim this company" →
creates an account → verifies email → submits proof of affiliation (company
email domain match, or document upload for manual review) → once approved,
their user id is linked as owner of that vendor record → they unlock an
edit dashboard to update capabilities, certifications (with issuing body +
expiry date fields), service area, capacity, photos, and documents.
Claimed profiles automatically move to "Claimed" trust status and display
the amber-outline badge. Add an admin review queue for claims that need
manual approval. Enforce row-level security: owners can only edit their
own vendor record.
```

## Prompt 3 — AI search with explanations (RAG)
```
Add AI-powered natural-language vendor search to avlpoint.com.
1) Create an embedding pipeline: on vendor create/update, concatenate name,
capabilities, certifications, and description; generate an embedding; store
in a pgvector column in Supabase.
2) Search endpoint: take a user's plain-English query (support voice input
via the Web Speech API), embed it, retrieve top 20 candidates by cosine
similarity, then call the Claude API (claude-sonnet-4-6) with the query and
candidate profiles. Claude must return strict JSON: ranked vendors, each with
match_score, reasons[] (specific, grounded ONLY in provided profile data —
never invented), and trust_level. Render results as ranked cards showing the
reasoning bullets and trust badge. Higher trust levels get a visual boost but
ranking must remain relevance-first, and any paid-network vendor must carry a
visible "AVLpoint Network" label. Keep the model name in one config constant
so it is swappable. Store the API key in environment variables only.
```

## Prompt 4 — Enterprise sandbox + AVL ingest
```
Build enterprise organization workspaces ("sandboxes") on avlpoint.com.
Each org has isolated data via Supabase RLS: private_vendors table keyed to
org_id, invite-based team membership, and roles (admin/member).
AVL Ingest: an upload zone accepting xlsx, csv, pdf, and images (photos or
scans of printed vendor lists). Send file content to Claude (vision for
images, document input for PDFs) with instructions to extract vendors into
strict JSON: name, capabilities, certifications, location, contact, notes,
and a confidence score per record. Show extracted rows in a human review
table (edit/approve/reject) before committing to private_vendors. Embed
approved records into the org's private vector index.
Combined search: org queries hit BOTH their private index and the public
network. Results are grouped and labeled: "On your AVL — approved" vs
"AVLpoint Network — verified, not on your list". Network results include a
"Request Audit & Onboarding" button that creates an audit_request record and
notifies admins. Private org data must never appear in another org's results
or be used to train anything — enforce with RLS and add tests proving it.
```

## Prompt 5 — Inspection marketplace + certification
```
Build the AVLpoint Inspection Marketplace. New tables: inspectors (profile,
credentials, coverage regions, base pricing, status), inspection_requests
(vendor_id, requester org or vendor, chosen inspector or "AVLpoint
Inspections" house option, status pipeline: requested → quoted → scheduled →
in_progress → passed/failed), and inspection_reports (checklist JSON, photo
evidence in Supabase Storage, inspector signature, date).
Public inspector directory page where vendors/enterprises choose any approved
inspector — house option and third parties presented on equal footing.
Payments via Stripe Connect: full amount to house jobs; third-party jobs
split with a 15% platform fee. On a passed inspection, the vendor's trust
level upgrades to "Level 1 Certified" (green badge) with an expiry date and
automated renewal reminders at 60/30/7 days. Build a mobile-friendly
inspection checklist screen inspectors fill out on site with photo capture.
```

## Prompt 6 — Meeting recorder → instant recommendations
```
Build the AVLpoint Meeting Recommender. In an org sandbox, a user can record
audio in-browser (MediaRecorder API) or upload an audio file. Send audio to
AssemblyAI (or Deepgram) for transcription with speaker labels. Then a
prominent button: "Get Recommendations". On click, send the transcript to
Claude with instructions to (1) extract every distinct procurement need
mentioned (equipment, fabrication jobs, services, specs, locations,
deadlines) as structured JSON, then (2) for each need, run the combined
sandbox+network vendor search and rank matches with grounded reasoning.
Output a results page: each need as a section with its recommended vendors,
reasons, and trust badges, plus an "Export report" button generating a
branded PDF (navy header, AVLpoint logo, amber accents). Save meetings and
reports to the org's history. Show clear progress states (transcribing →
analyzing → matching) since the pipeline takes a minute.
```

---

# PART 6 — IMMEDIATE NEXT STEPS (THIS WEEK)

1. **Lock the brand:** pick the primary tagline, approve the color palette, and I'll generate the AVLpoint logo + badge set next session.
2. **Confirm the stack** of the current avlpoint.com site — if it's not Next.js + Supabase, we port it before adding features (cheap now, expensive later).
3. **Run Prompt 1** in Cursor to bring the live site onto the brand system.
4. **Start customer discovery in parallel:** 5 conversations with plant/procurement contacts (JB's network) validating the sandbox price point, and 10 vendors validating the $299–499 membership. The June plan's Appendix A interview script still applies.
5. **Register the trust-badge trademarks** wording early ("AVLpoint Verified", "AVLpoint Level 1 Certified") — the badges are the brand.

*The fabric gets woven one thread at a time — but you already own the loom: the database, the industry expertise, and now the plan. Let's build.*
