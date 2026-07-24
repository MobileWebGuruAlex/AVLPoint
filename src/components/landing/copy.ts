/**
 * The AVLpoint cinematic landing — chapter script.
 *
 * One entry per chapter of the scroll film. The global timeline is 10 units
 * long (1 unit per chapter); chapter i owns progress window [i, i+1].
 * `align` positions the copy block so it never fights the clip's subject.
 *
 * Voice: confident, concise, premium — but always EXPLAINING. Every chapter
 * teaches what AVLpoint is, how it was built, or what it does for a specific
 * kind of user (enterprise buyer, vendor shop, field inspector).
 */

export type ChapterAlign = "center" | "left" | "right" | "bottom" | "top";

export interface Chapter {
  /** frame directory key, e.g. "ch01" */
  key: string;
  /** small eyebrow line above the headline */
  kicker: string;
  title: string;
  /** body lines render as separate staggered rows */
  lines: string[];
  /** the educational layer — how it works / why it's special */
  detail?: string;
  /** optional glass chips (facts / live-feeling telemetry) */
  chips?: string[];
  /** optional late-beat line that lands deeper into the chapter */
  beat?: string;
  /** the ch5 breakthrough pill */
  unlock?: string;
  align: ChapterAlign;
  /** poster shown before frames stream in (and in reduced-motion mode) */
  poster: string;
}

export const TRACK_VH = 1300; // total scroll length (10 chapters × 130vh)

export const CHAPTERS: Chapter[] = [
  {
    key: "ch01",
    kicker: "AVLpoint · Vendor Intelligence",
    title: "Intelligent Vendor Management.",
    lines: [
      "Qualification, compliance, and asset verification — forged into one platform.",
    ],
    detail:
      "A two-minute introduction to the system built for the people who build everything else.",
    align: "center",
    poster: "/landing/posters/ch01.webp",
  },
  {
    key: "ch02",
    kicker: "01 · The Problem",
    title: "Vendor truth is scattered across the shop.",
    lines: [
      "Quals live in spreadsheets. Certs live in inboxes. Weld logs live in a drawer.",
      "Every audit starts from zero. Every expiry is a surprise.",
    ],
    detail:
      "AVLpoint started with an observation from the floor: the data isn't missing — it's everywhere. So we built the system that brings it home.",
    beat: "It doesn't have to work this way.",
    align: "left",
    poster: "/landing/posters/ch02.webp",
  },
  {
    key: "ch03",
    kicker: "02 · The Platform",
    title: "One source of truth — from quote to first article.",
    lines: [
      "Every vendor record, certificate, and verification unified into a single living network.",
    ],
    detail:
      "Autonomous AI agents read each vendor's web presence and registry records around the clock — 85,000+ industrial suppliers discovered across 14 authoritative sources, distilled into 90+ structured fields with the receipts attached.",
    chips: ["85,000+ vendors indexed", "14 verification sources", "Field-level provenance"],
    align: "right",
    poster: "/landing/posters/ch03.webp",
  },
  {
    key: "ch04",
    kicker: "03 · The Workflow",
    title: "Upload. Verify. Approve.",
    lines: [
      "Drop in a certificate — AI reads every field, checks it at the source, and routes it for sign-off with the audit trail already written.",
    ],
    detail:
      "Claims are verified against issuing bodies — ASME, AISC, AWS, ISO — not self-reported marketing copy. Approvals land timestamped and audit-ready.",
    align: "bottom",
    poster: "/landing/posters/ch04.webp",
  },
  {
    key: "ch05",
    kicker: "04 · For Vendors",
    title: "The door to enterprise finally opens.",
    lines: [
      "Claim one living profile — capabilities, equipment, certifications — and watch your compliance status in real time.",
    ],
    detail:
      "Your profile works while you run the floor: expirations flagged before they lapse, capabilities searchable by every enterprise on the network, your shop visible to buyers who could never find you before.",
    beat: "Then, for the first time: direct channels into enterprise networks that used to be walled off.",
    unlock: "CHANNEL OPEN — enterprise buyers can now see your shop",
    align: "left",
    poster: "/landing/posters/ch05.webp",
  },
  {
    key: "ch06",
    kicker: "05 · For Enterprises",
    title: "Your entire vendor world on one globe.",
    lines: [
      "Every profile a vendor builds flows straight into your network view — mapped, risk-scored, compliance-tracked.",
    ],
    detail:
      "Qualify once, monitor forever. Suitability scoring pre-ranks every shortlist, expiring certs surface weeks ahead, and onboarding becomes a pipeline instead of a pile.",
    chips: ["Risk index · low", "Compliance 98.2%", "1,847 active vendors", "3 certs expire in 30 days"],
    align: "left",
    poster: "/landing/posters/ch06.webp",
  },
  {
    key: "ch07",
    kicker: "06 · For Inspectors",
    title: "The field syncs to the source.",
    lines: [
      "Weld-seam photos, findings, and asset data stream from the shop floor into the vendor record — geotagged, timestamped, audit-ready before you're back in the truck.",
    ],
    detail:
      "On-site inspections raise a vendor to Level 1 Certified — independent verification an enterprise can trust without flying its own team out.",
    chips: ["Photo synced · seam #14", "Checklist 9 of 9", "Pushed to enterprise dashboard"],
    align: "right",
    poster: "/landing/posters/ch07.webp",
  },
  {
    key: "ch08",
    kicker: "07 · The Architecture",
    title: "Three worlds. One nervous system.",
    lines: [
      "Encrypted pathways connect vendors, enterprises, and inspectors in real time — while AI verifies, enriches, and scores every record in motion.",
    ],
    detail:
      "Every field carries provenance. Every hand-off is encrypted. Every score is explainable. That's what makes the network trustworthy enough to run procurement on.",
    chips: ["Vendors", "Enterprises", "Inspectors"],
    align: "top",
    poster: "/landing/posters/ch08.webp",
  },
  {
    key: "ch09",
    kicker: "08 · The Technology",
    title: "Enterprise-grade, by design.",
    lines: [
      "Cloud-native and built to scale with your approved vendor list. Open APIs that meet your ERP where it is.",
    ],
    detail:
      "AI enrichment pipelines run around the clock; security is layered the way your auditors expect — encryption in transit and at rest, role-based access, immutable audit trails.",
    chips: ["Encryption in transit & at rest", "Role-based access", "Immutable audit trails", "Open API"],
    align: "center",
    poster: "/landing/posters/ch09.webp",
  },
  {
    key: "ch10",
    kicker: "AVLpoint",
    title: "The network is waiting.",
    lines: [
      "Step into the platform where vendors, enterprises, and inspectors finally share one truth.",
    ],
    detail:
      "Search 85,000+ verified industrial vendors, claim your shop, or commission an inspection — it all starts inside.",
    align: "center",
    poster: "/landing/posters/ch10.webp",
  },
];

/** Rail / chapter-counter labels (short). */
export const CHAPTER_LABELS = [
  "The Core",
  "The Problem",
  "The Platform",
  "The Workflow",
  "For Vendors",
  "For Enterprises",
  "For Inspectors",
  "Architecture",
  "Technology",
  "Enter",
];
