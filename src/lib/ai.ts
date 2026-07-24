/**
 * AVLpoint AI layer — Claude, self-hosted deployment.
 *
 * Decision (per AVLpoint_Stack_Legal_AccessPlan.md, confirmed by Alex):
 * Claude is the reasoning brain; the platform runs on our own
 * infrastructure. No Gemini/Firebase coupling anywhere.
 *
 * Design rules encoded here:
 *  - ONE swappable model constant (never hardcode the model elsewhere).
 *  - Responses grounded ONLY in database rows we pass in — the model is
 *    forbidden from inventing vendor facts (defensible recommendations).
 *  - Zero mandatory cost: everything degrades gracefully when the API key
 *    is unset; the FTS index keeps search working free.
 */
import type { VendorRow } from "./vendors";
import { jsonList, vendorLocation } from "./utils";

/** The single source of truth for which model powers recommendations. */
export const AI_MODEL = process.env.AVL_AI_MODEL ?? "claude-sonnet-4-6";
/** Cheap-tier model for high-volume, low-stakes tasks (tagging, autocomplete). */
export const AI_MODEL_FAST = process.env.AVL_AI_MODEL_FAST ?? "claude-haiku-4-5-20251001";

/**
 * Dedicated env vars (AVL_*) so the website never collides with the
 * pipeline's OpenRouter routing (ANTHROPIC_BASE_URL/AUTH_TOKEN in .env).
 */
const API_URL = `${process.env.AVL_AI_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`;
const API_KEY = process.env.AVL_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

export interface RankedVendor {
  id: number;
  match_score: number;
  reasons: string[];
  trust_level: string;
}

export function aiAvailable(): boolean {
  return Boolean(API_KEY);
}

/** Compact, grounded candidate profile — keeps tokens (and cost) minimal. */
function candidateBrief(v: VendorRow): Record<string, unknown> {
  return {
    id: v.id,
    name: v.company_name,
    location: vendorLocation(v),
    type: v.primary_business_type,
    summary: (v.ai_summary ?? v.company_description ?? "").slice(0, 400),
    certifications: jsonList(v.certifications_held).slice(0, 10),
    capabilities: jsonList(v.capabilities).slice(0, 10),
    services: jsonList(v.services).slice(0, 8),
    tier: v.enterprise_tier,
    verified: v.completeness_status === "verified",
  };
}

const SYSTEM_PROMPT = `You rank industrial vendors for procurement buyers on AVLpoint.
Rules — these are compliance requirements, not suggestions:
1. Ground every reason ONLY in the candidate data provided. Never invent capabilities, certifications, locations, or facts.
2. Reasons must be specific ("holds ASME U stamp", "located in Texas as requested"), never generic praise.
3. Rank by relevance to the query first. Verified status may break ties but must never outrank relevance.
4. trust_level is "verified" or "listed" exactly as given in the data.
5. Respond with STRICT JSON only: {"results":[{"id":number,"match_score":0-100,"reasons":[string,...],"trust_level":string}]} — no prose, no markdown fences.`;

/**
 * Rank + explain candidates with Claude. Returns null when AI is
 * unavailable or fails — callers must treat null as "FTS ranking stands".
 */
export async function rankVendors(
  query: string,
  candidates: VendorRow[]
): Promise<RankedVendor[] | null> {
  const key = API_KEY;
  if (!key || candidates.length === 0) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Buyer query: ${JSON.stringify(query)}\n\nCandidates:\n${JSON.stringify(
              candidates.map(candidateBrief)
            )}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { results?: RankedVendor[] };
    if (!Array.isArray(parsed.results)) return null;

    // Trust nothing: keep only ids we actually sent, clamp scores.
    const validIds = new Set(candidates.map((c) => c.id));
    return parsed.results
      .filter((r) => validIds.has(r.id) && Array.isArray(r.reasons))
      .map((r) => ({
        id: r.id,
        match_score: Math.max(0, Math.min(100, Math.round(Number(r.match_score) || 0))),
        reasons: r.reasons.slice(0, 4).map(String),
        trust_level: r.trust_level === "verified" ? "verified" : "listed",
      }));
  } catch {
    return null;
  }
}

/* ================================================================
   Hire recommendation — compares the buyer's own approved vendors
   against AVLpoint network matches and returns a grounded verdict.
   ================================================================ */

export interface HireRecommendation {
  /** "your_avl" | "avlpoint" | "tie" — which pool the pick comes from. */
  source: "your_avl" | "avlpoint" | "none";
  /** Name of the recommended company (must be one we passed in). */
  pick: string | null;
  /** vendor id when the pick is an AVLpoint-network company (for linking/inspection). */
  pick_vendor_id: number | null;
  verdict: string;          // one-paragraph, grounded
  comparison: string[];     // bullet points contrasting the options
  inspect: boolean;         // whether an independent inspection is advised
  inspect_reason: string;
}

const RECOMMEND_SYSTEM = `You are a procurement advisor on AVLpoint. Given ONE sourcing need, the buyer's own approved vendors ("your AVL"), and AVLpoint network matches, decide who they should hire.
Rules — compliance requirements, not suggestions:
1. Use ONLY the facts provided. Never invent capabilities, certifications, or locations.
2. "pick" MUST be one of the company names provided, or null if none fit.
3. Set source to "your_avl" if the pick is from the buyer's list, "avlpoint" if from the network, "none" if nothing fits.
4. Only set pick_vendor_id when the pick is an AVLpoint-network company and you were given its id; otherwise null.
5. Recommend inspection (inspect=true) when the pick is not already verified/certified, or the job is high-consequence (pressure, structural, aerospace, offshore).
6. Respond with STRICT JSON only, no markdown:
{"source":"your_avl|avlpoint|none","pick":string|null,"pick_vendor_id":number|null,"verdict":string,"comparison":[string,...],"inspect":boolean,"inspect_reason":string}`;

export async function recommendHire(input: {
  need: string;
  specs?: string;
  location?: string;
  yourAvl: { name: string; location: string | null; capabilities: string | null }[];
  network: { id: number; name: string; location: string; certifications: string[]; trust: string; reasons: string[] }[];
}): Promise<HireRecommendation | null> {
  if (!API_KEY) return null;
  if (input.yourAvl.length === 0 && input.network.length === 0) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 900,
        system: RECOMMEND_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Need: ${JSON.stringify(input.need)}${input.specs ? `\nSpecs: ${input.specs}` : ""}${input.location ? `\nLocation: ${input.location}` : ""}\n\nYour AVL (buyer's approved vendors):\n${JSON.stringify(input.yourAvl)}\n\nAVLpoint network matches:\n${JSON.stringify(input.network)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    const p = JSON.parse(text.slice(s, e + 1)) as Partial<HireRecommendation>;

    // Ground the pick: it must be a name we actually sent.
    const names = new Set([...input.yourAvl.map((v) => v.name), ...input.network.map((v) => v.name)]);
    const pick = p.pick && names.has(p.pick) ? p.pick : null;
    const netMatch = input.network.find((v) => v.name === pick);
    return {
      source: p.source === "your_avl" || p.source === "avlpoint" ? p.source : pick ? (netMatch ? "avlpoint" : "your_avl") : "none",
      pick,
      pick_vendor_id: netMatch?.id ?? null,
      verdict: String(p.verdict ?? "").slice(0, 800),
      comparison: Array.isArray(p.comparison) ? p.comparison.slice(0, 5).map(String) : [],
      inspect: Boolean(p.inspect),
      inspect_reason: String(p.inspect_reason ?? "").slice(0, 300),
    };
  } catch {
    return null;
  }
}
