# AVLPOINT — BRAND SYSTEM & FEATURE CATALOG
### The design language + every feature that makes this unlike anything on the market
**July 2026 · Confidential**

---

# PART 1 — THE OFFICIAL BRAND SYSTEM

Built directly from what's already live on the site (which looks great) — codified so every future page, deck, email, and badge stays consistent.

## 1.1 Design DNA — "Mission Control Minimalism"
The site should feel like the control room for industrial commerce: dark, calm, precise, data-forward. Nothing decorative. Every glow means something (a live system, a verified state, an AI action).

**Five rules:**
1. **Dark by default.** Near-black void background; content lives in slightly-lighter panels. Light mode exists (you built it) but dark is the brand.
2. **One gradient, used sparingly.** Blue→cyan appears ONLY on: the "point" in the wordmark, primary CTAs, live/AI indicators, and key stats. If everything glows, nothing does.
3. **Mono-font = data.** JetBrains Mono / Consolas for anything machine-generated: counts, timestamps, provenance strings, section labels (`LIVE DATA`, `PRICING`). Sans-serif (Inter) for everything human.
4. **Green is sacred.** Emerald appears exclusively on verification/certification states. A user should be able to squint and instantly see what's trusted.
5. **Motion = system alive.** Subtle pulse on the hub node, count-up animations on stats, shimmer on "pipeline active" — never bouncy, never playful.

## 1.2 Color Tokens
| Token | Hex | Use |
|---|---|---|
| `void` | `#0A0F16` | Page background |
| `panel` | `#111826` | Cards, surfaces |
| `line` | `#1B2534` | Borders, grid texture |
| `signal` | `#3B82F6` | Primary blue — CTAs, links, Tier chips |
| `pulse` | `#38BDF8` | Cyan — gradient partner, live indicators, AI accents |
| `certified` | `#10B981` | Green — verification states ONLY |
| `warn` | `#F59E0B` | Expiring certs, pending states |
| `danger` | `#EF4444` | Failed inspection, expired |
| `text` | `#F2F6FB` | Primary text |
| `muted` | `#7C8AA0` | Secondary text, mono labels |

## 1.3 Logo System (files delivered)
- **Primary lockup** — hexagon hub icon + "AVL**point**" wordmark + tagline. The icon is the network: one glowing hub (the point) connected to satellite nodes (the vendors) inside a hexagon (industry/engineering).
- **App icon / favicon** — the hexagon hub alone, on the rounded dark tile.
- **Trust Ladder badge set** — Listed (gray) → Claimed (blue outline) → Verified (blue gradient) → Level 1 Certified (green + check), plus the **embeddable website badge** certified vendors put on their own sites. That badge is a growth engine: every certified vendor's website advertises AVLpoint for free.
- Clear space: one hexagon-width around the mark. Never recolor, never place the green on anything unverified.

## 1.4 Voice
Plain, confident, technical. Numbers over adjectives. "85,174 vendors indexed" beats "huge database." AI always shows its work — the copy does too.

---

# PART 2 — THE COMPLETE FEATURE CATALOG

Organized by who it serves. ★ = differentiator nobody else has. Items marked LIVE are already on the site per your screenshots.

## 2.1 For EVERYONE — The Core
- **LIVE** — Natural-language vendor search with ranked results, filters (business type, certifications, country, tier), suitability scores, sub-second search across 85K+ vendors.
- **LIVE** — AI-enriched vendor profiles: capability summary, certifications, company facts, data provenance.
- **LIVE** — Autonomous discovery pipeline (14 sources) + suitability tiering.
- ★ **Explainable matching** — every recommendation shows *why*: which certs, capabilities, and evidence drove the match. Trust through transparency.
- **Voice search** — speak the need ("ASME U-stamp shop near Baton Rouge, 10,000 gallon capacity") on desktop and mobile.
- **Saved searches + alerts** — "Tell me when a NADCAP-certified shop appears in Texas." Turns the living database into a subscription hook.

## 2.2 For ENTERPRISES — The Sandbox (the big-company magnet)
- ★ **Private AVL Sandbox** — isolated workspace per organization. Upload your legacy AVL in ANY form: spreadsheet, ERP export, PDF, scan, **even a photo of a printed list**. AI parses → human review screen → structured private database. No matter how old the data is, it comes alive.
- ★ **Unified search, honestly labeled** — one query searches BOTH their private AVL and the AVLpoint network. Results grouped: `ON YOUR AVL · APPROVED` vs `AVLPOINT NETWORK · VERIFIED`. Instantly answers "do we already have someone for this?" AND "who's better that we're missing?"
- ★ **Gap analysis** — AI compares their vendor list against the network and reports: coverage gaps, single-source risks, vendors with expired certs, and stronger alternatives for weak spots. This report alone is worth the subscription.
- ★ **The Meeting Recommender** — record or upload a project meeting; hit one button; get back every procurement need mentioned, matched vendors per need with reasoning, and a branded export. The demo that closes deals.
- **Team workspaces** — roles, shared shortlists, comments on vendor profiles, approval workflows ("Engineering proposed → Procurement approved").
- **Compliance cockpit** — expiry dashboard for every cert on their AVL, with 60/30/7-day alerts. Nobody gets surprised by a lapsed ASME stamp again.
- **RFQ dispatch** — select 5 vendors from a search → send one structured quote request → responses tracked in-platform. (Later phase, huge lock-in.)
- **API + SSO** (LIVE on pricing page) — pipe verified vendor data into their ERP.

## 2.3 For VENDORS — From invisible to certified
- **LIVE** — Claim your profile (seen on your pricing page).
- **Profile studio** — enrich the card: capabilities, equipment lists, capacity, photos, project gallery, service regions, key contacts.
- ★ **Trust Ladder progression** — Listed → Claimed → Verified → Level 1 Certified, each rung visibly boosting search placement. Gamified credibility with real revenue behind it.
- ★ **Embeddable Certified badge** — verified vendors display the AVLpoint badge on their own site, linking back to their live profile. Free distribution for us, credibility for them.
- **Visibility analytics** — profile views, search appearances, "you appeared in 14 searches for pressure-vessel work this month — 3 were Fortune 500 accounts." The stat that renews subscriptions.
- **Lead inbox** — enterprises can request info/quotes; vendors respond in-platform.
- **Cert wallet** — upload certs once, get renewal reminders, share a live link instead of emailing PDFs forever.

## 2.4 For INSPECTORS — The marketplace (competitors → partners)
- ★ **Inspection Marketplace** — approved third-party inspection companies list coverage areas, credentials, and pricing. Vendors/enterprises choose ANY inspector — ours or theirs — on equal footing. We take a platform fee on third-party jobs, 100% on house jobs.
- ★ **Field inspection app** — mobile checklist with photo evidence, geotagged, signed, auto-generating the certification report and flipping the vendor's badge to green on pass.
- **Inspector reputation** — completed inspections, on-time rate, ratings. The marketplace polices itself.

## 2.5 The CRM Layer — "My Vendors" (your CRM idea, sharpened)
- ★ **Relationship pipeline** — every account (small shop or Fortune 500) manages vendors like deals in a CRM: columns for *Watching → Contacted → Quoting → Working With → Approved (on our AVL)*. Drag-and-drop.
- **Vendor timeline** — every interaction logged per vendor: searches that surfaced them, notes, RFQs, inspection reports, meetings where the AI recommended them.
- **Reminders & tasks** — "follow up with Tulsa Pressure Vessel on Friday," "re-inspect Midwest Precision in Q3."
- This turns AVLpoint from a search tool you visit into the system of record you live in — that's the retention moat.

## 2.6 Signature "nothing-else-has-this" moments
1. ★ **Photo-to-AVL** — snap a picture of a 1998 printed vendor list; it becomes a searchable database in 60 seconds. The single best sales demo for old-school industry.
2. ★ **Meeting → shortlist button** — end the meeting, press once, get the vendors.
3. ★ **Two-sided trust** — the only platform where the recommendation engine AND an independent inspection layer live in one place. Ariba can't say that; ThomasNet can't say that.
4. ★ **Provenance on every field** (LIVE) — lean into it everywhere; it's your compliance-grade credibility.
5. ★ **The living database** (LIVE) — "your AVL builds and corrects itself around the clock" is already your best line. Put it on everything.

---

# PART 3 — WHAT TO BUILD NEXT (priority order)

1. **Vendor claim flow + Trust Ladder badges** on cards (revenue starts here — the pricing page already promises it).
2. **Enterprise sandbox + AVL ingest** (spreadsheet/PDF/photo) — the enterprise seat-seller.
3. **Compliance cockpit** (cert expiry alerts) — cheap to build, screams enterprise value.
4. **My Vendors CRM board** — retention.
5. **Inspection Marketplace + field app** — the trust moat + revenue stream four.
6. **Meeting Recommender** — the showstopper, once sandboxes exist to search against.

Say the word and I'll write the Cursor build prompt for any of these, styled to the exact tokens in Part 1.
