/**
 * Claude extraction helpers — Phase 3 (AVL ingest) and Phase 5 (meeting
 * recommender). Same grounding philosophy as ai.ts: strict JSON out,
 * everything validated before it touches the database.
 */
import { AI_MODEL } from "./ai";

const API_URL = `${process.env.AVL_AI_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`;
const API_KEY = process.env.AVL_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

export interface ExtractedVendor {
  name: string;
  capabilities?: string;
  certifications?: string;
  location?: string;
  contact?: string;
  notes?: string;
  confidence?: number;
}

export interface ExtractedNeed {
  need: string;
  specs?: string;
  location?: string;
  query: string;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

async function callClaude(system: string, content: ContentBlock[], maxTokens = 3000): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.find((b) => b.type === "text")?.text ?? null;
  } catch {
    return null;
  }
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const INGEST_SYSTEM = `You extract vendor records from legacy Approved Vendor List documents (spreadsheets, PDFs, scans, photos of printed lists).
Rules:
1. Extract ONLY vendors actually present in the document. Never invent or embellish.
2. One record per distinct company. Merge obvious duplicates.
3. confidence is 0-1: how certain you are the record is read correctly (lower for blurry/ambiguous rows).
4. Strings should be short and clean; omit fields not present in the document.
5. STRICT JSON only: {"vendors":[{"name":string,"capabilities":string,"certifications":string,"location":string,"contact":string,"notes":string,"confidence":number}]} — no prose, no fences.`;

/** Parse an uploaded AVL (CSV/TSV text, PDF, or image) into structured vendor rows. */
export async function extractVendorsFromFile(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<{ vendors: ExtractedVendor[] } | { error: string }> {
  if (!API_KEY) return { error: "AI ingest requires the Claude API key to be configured." };

  let content: ContentBlock[];
  if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    if (buffer.length > 8_000_000) return { error: "PDF too large (8MB max)." };
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
      { type: "text", text: "Extract every vendor from this AVL document." },
    ];
  } else if (mime.startsWith("image/")) {
    if (buffer.length > 5_000_000) return { error: "Image too large (5MB max)." };
    content = [
      { type: "image", source: { type: "base64", media_type: mime, data: buffer.toString("base64") } },
      { type: "text", text: "This is a photo/scan of a printed vendor list. Extract every vendor." },
    ];
  } else {
    // Treat as text (CSV/TSV/TXT). Excel users: export as CSV.
    const text = buffer.toString("utf8").slice(0, 60_000);
    if (text.trim().length < 3) return { error: "File appears empty. For Excel files, save as CSV first." };
    content = [{ type: "text", text: `Extract every vendor from this AVL file (${filename}):\n\n${text}` }];
  }

  const raw = await callClaude(INGEST_SYSTEM, content, 4000);
  const parsed = parseJson<{ vendors: ExtractedVendor[] }>(raw);
  if (!parsed?.vendors || !Array.isArray(parsed.vendors)) return { error: "Could not extract vendors from this file." };

  const vendors = parsed.vendors
    .filter((v) => v && typeof v.name === "string" && v.name.trim())
    .slice(0, 300)
    .map((v) => ({
      name: String(v.name).slice(0, 200),
      capabilities: v.capabilities ? String(v.capabilities).slice(0, 400) : undefined,
      certifications: v.certifications ? String(v.certifications).slice(0, 300) : undefined,
      location: v.location ? String(v.location).slice(0, 200) : undefined,
      contact: v.contact ? String(v.contact).slice(0, 200) : undefined,
      notes: v.notes ? String(v.notes).slice(0, 400) : undefined,
      confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0.5)),
    }));
  return { vendors };
}

const NEEDS_SYSTEM = `You extract procurement needs from a project meeting transcript for an industrial buyer.
Rules:
1. Extract every DISTINCT procurement need actually discussed: equipment to buy, fabrication jobs, services, inspections, materials.
2. Ground everything in the transcript — never invent needs, specs, or locations.
3. "query" is a short vendor-search phrase for that need (e.g. "ASME U-stamp pressure vessel fabricator Gulf Coast").
4. STRICT JSON only: {"needs":[{"need":string,"specs":string,"location":string,"query":string}]} — no prose, no fences.`;

/** Extract distinct procurement needs from a meeting transcript. */
export async function extractNeeds(transcript: string): Promise<ExtractedNeed[] | null> {
  const raw = await callClaude(NEEDS_SYSTEM, [
    { type: "text", text: `Meeting transcript:\n\n${transcript.slice(0, 40_000)}` },
  ]);
  const parsed = parseJson<{ needs: ExtractedNeed[] }>(raw);
  if (!parsed?.needs || !Array.isArray(parsed.needs)) return null;
  return parsed.needs
    .filter((n) => n && typeof n.need === "string" && n.need.trim())
    .slice(0, 12)
    .map((n) => ({
      need: String(n.need).slice(0, 200),
      specs: n.specs ? String(n.specs).slice(0, 300) : undefined,
      location: n.location ? String(n.location).slice(0, 120) : undefined,
      query: String(n.query || n.need).slice(0, 200),
    }));
}
