# AVLpoint — Partner Handoff & Change Summary

*Prepared for review. Covers what the platform does, what we changed, and why we cut the database down to build it back up better.*

---

## The strategy in one paragraph

AVLpoint was sitting on **~93,500 vendor records**, but most were junk — scraped page titles, dead links, error pages, and off-topic sites ("Cheap Flights to Tokyo" was tagged as a manufacturer). We are building an **exclusive, best-of-the-best** platform, not a bulk directory. So we **put 66,500 junk/unqualified records to sleep** (hidden everywhere public, but fully recoverable — nothing was deleted) and kept **~27,000 real, classified industrial companies**. Now we're **enriching those survivors into deep, AI-searchable supplier profiles** — turning a thin blurb into a full decision-grade briefing on each company. Fewer vendors, all real, each one rich. That's the whole thesis.

---

## Current numbers (live)

| Metric | Count |
|---|---|
| Total records in database | 93,546 |
| **Put to sleep** (junk/unqualified, recoverable) | 66,521 |
| **Kept & visible** (awake, real industrial) | 27,025 |
| **US-only (the public default)** | 13,242 |
| Already upgraded to full deep profile | 469 (growing) |
| Auto-quarantined (dead URLs, can't enrich) | 50 |

---

## Part 1 — Pipeline changes (the data engine)

**1. Curation (the big cut).** Using pure database logic (zero AI cost), we scored every record on real signals — industrial business classification, sane company name, live website, contact info — and slept everything that failed. Reversible anytime. Result: 93.5k → 27k real companies.

**2. Richer enrichment.** The old pipeline wrote a 50–80 word blurb per company. We rewrote it to produce a **250–450 word, multi-paragraph, decision-grade profile** covering: who they are, exact capabilities & processes, products, materials, quality/certification posture (ASME, API, ISO, AWS, NADCAP, ITAR…), industries & named customers, and scale (facility size, headcount, year established). Plus structured data (capabilities, products, certifications, inspection/QA) that powers AI search. *Example: one company went from a 350-character stub to a 2,772-character full profile with its entire product line, certifications, and customer list.*

**3. Only enriches the good ones.** Enrichment now **skips all slept vendors** — we never spend a cent processing junk. It also skips any company already upgraded, so progress only moves forward.

**4. Hard cost controls.** After a past incident, we locked spend down: input is truncated, output is capped, and there are **per-company ($0.25) and per-run ($5) hard ceilings**. Dead-URL companies auto-quarantine after 3 tries so we never loop on them.

**5. AI provider.** Enrichment can run through either the direct Anthropic API or **OpenRouter.ai** (one setting). We are routing through OpenRouter for tighter budget control (you can only spend what's deposited).

**6. Scheduling.** An automated job was set up to enrich in small batches every 2 hours. **It is currently STOPPED** pending the OpenRouter top-up, then it resumes automatically.

> **Note on cost:** enriching ~13k US companies at ~$0.03 each is roughly **$300–400 total, spread over time** — a one-time investment to make every kept vendor genuinely rich and searchable. It is fully throttled.

---

## Part 2 — Website capabilities (what the platform does)

### For enterprise buyers
- **AI vendor search** — full-text search across summaries, capabilities, equipment, and certifications, ranked and explained.
- **Geographic control** — **US-only by default** (we're a US company). A Region selector switches to International or Worldwide only when the user explicitly chooses it.
- **Private sandbox** (`/sandbox`) — a secure, per-organization workspace to upload and manage your own approved-vendor lists, isolated from other tenants.
- **Meeting copilot** (`/meetings`) — paste or record a project meeting; it extracts your sourcing needs, **compares your vendor list against AVLpoint's directory, recommends who to hire (with reasons), and suggests an inspector** to verify the build.

### For vendors (the companies listed)
- **Claim your profile** (`/claim`) with **instant website-token verification** — place a code on your site, get approved automatically (no waiting on manual review).
- **Profile builder** — a LinkedIn-style editor: pick a template, brand color, tagline, "about," banner, photo gallery, and highlight stats. Fully owner-controlled.
- **Trust Ladder** — Listed → Claimed → Verified → Level 1 Certified; higher rungs rank higher in AI search.

### For inspectors
- **Inspector profiles** with selectable page skins, photo/banner, certifications, service regions, specialties, and pricing.
- **Inspection marketplace** (`/inspections`) — buyers request → quote → schedule → on-site inspection → a **pass auto-issues a 1-year Level 1 Certification**. House team and independents shown on equal footing.

### Site-wide
- **AI chatbot** (bottom-right on every page) — answers questions directly from a site knowledge base **and live vendor data**, citing real records with profile links. Respects the US-only default.
- **Admin panel** — full control center: role-based access (super admin / ops / support), user management & invitations, the sleep/wake controls, bulk operations, full audit log, and backups.
- **Security** — real login (no default passwords in production), revocable sessions, login rate-limiting, and an audit trail on every sensitive action.

---

## Part 3 — Why this order matters

We deliberately **narrowed before we deepened**. Enriching 93k records — most of them garbage — would have cost thousands and produced a directory full of noise. By curating first, every dollar of enrichment now lands on a company we actually want to show a client. The end state: a lean directory of **real, US industrial suppliers, each with a deep, AI-searchable profile** — exactly what our enterprise buyers need, and defensibly better than any bulk scraper directory.

---

## Immediate status

- ✅ Curation complete (66.5k slept, reversible).
- ✅ Richer enrichment live and verified.
- ✅ Cost controls + US-only default + chatbot knowledge base in place.
- ⏸️ **Enrichment paused** — resumes once OpenRouter credits are added.
- 🔜 Next: refill OpenRouter → resume the every-2-hour job → work through the ~13k US backlog. (A separate URL-refresh pass will later recover companies whose old links are dead.)
