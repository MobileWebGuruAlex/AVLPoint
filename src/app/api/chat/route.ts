/**
 * Site assistant — the corner chatbot's backend.
 *
 * Grounded, on-brand help for any AVLpoint visitor. Every reply runs through
 * the SAME funded Anthropic key that powers the rest of the site's AI
 * (AVL_ANTHROPIC_API_KEY). When the user's question looks like a vendor search,
 * we retrieve real awake vendors from the database and hand them to Claude as
 * grounding, so the assistant cites actual records instead of inventing them.
 */
import { NextRequest, NextResponse } from "next/server";
import { AI_MODEL_FAST, aiAvailable } from "@/lib/ai";
import { searchVendors } from "@/lib/vendors";
import { searchKb } from "@/lib/kb";
import { vendorLocation, jsonList } from "@/lib/utils";

const API_URL = `${process.env.AVL_AI_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`;
const API_KEY = process.env.AVL_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

export const maxDuration = 30;

const SYSTEM = `You are the AVLpoint assistant — a concise, knowledgeable guide embedded on avlpoint.com.

WHAT AVLPOINT IS: an AI-powered vendor-intelligence platform for industrial fabrication sourcing. It maintains a curated directory of manufacturers and fabricators (welding, CNC machining, structural steel, pressure vessels, sheet metal, etc.), enriched into decision-grade supplier profiles. It serves three audiences: enterprise buyers (search the directory, build a private "sandbox" AVL, run a meeting copilot that recommends who to hire), vendors (claim and customize their own profile), and inspectors (list services, take jobs, issue Level 1 Certifications).

HOW TO HELP:
- ANSWER THE QUESTION DIRECTLY using the KNOWLEDGE and VENDOR MATCHES provided below. Give the substantive answer first — a page link is only a secondary call-to-action, NEVER the whole reply. Do not tell the user to "go to a page to find out"; tell them the answer.
- When looking for vendors, cite VENDOR MATCHES by name with location and certifications, and link their profile at /vendors/<id>. Never invent vendors or facts.
- If matches are weak, still give the best substantive answer from KNOWLEDGE, then optionally add one link.
- GEOGRAPHY: results are US-only by default. Only discuss international vendors if the user explicitly asks for international/global/a non-US country; otherwise keep to US and, if they want more, mention the Region selector on /search.
- A link may follow the answer when the user must act there: /search, /sandbox, /meetings, /inspections, /claim, /pricing, /signup.
- Be brief and plain. If the data doesn't say, say so. No personalized financial advice; never fabricate certifications.`;

interface ChatMessage { role: "user" | "assistant"; content: string }

export async function POST(request: NextRequest) {
  if (!aiAvailable()) {
    return NextResponse.json({ error: "The assistant is offline right now." }, { status: 503 });
  }

  let messages: ChatMessage[] = [];
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  // Sanitize + bound the history the model sees.
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    return NextResponse.json({ error: "No question provided." }, { status: 400 });
  }
  const lastUser = clean[clean.length - 1].content;

  // Knowledge base retrieval — the primary grounding so the assistant answers directly.
  let grounding = "";
  try {
    const kb = searchKb(lastUser, 3);
    if (kb.length) {
      grounding += `\n\nKNOWLEDGE (AVLpoint facts — answer from these):\n${kb.map((d) => `# ${d.title}\n${d.body}`).join("\n\n")}`;
    }
  } catch { /* KB optional */ }

  // Retrieve real vendor matches (US-only unless the user asked for international).
  const wantsIntl = /\b(international|intl|global|worldwide|outside the us|non-us|overseas|europe|asia|canada|mexico|uk|china|germany|italy|india)\b/i.test(lastUser);
  try {
    const result = await searchVendors({ q: lastUser, sort: "relevance", page: 1, scope: wantsIntl ? "all" : "us" });
    if (result.vendors.length > 0) {
      const top = result.vendors.slice(0, 5).map((v) => ({
        id: v.id,
        name: v.company_name,
        location: vendorLocation(v),
        type: v.primary_business_type,
        certifications: jsonList(v.certifications_held).slice(0, 5),
        summary: (v.ai_summary ?? v.company_description ?? "").slice(0, 200),
      }));
      grounding += `\n\nVENDOR MATCHES (real ${wantsIntl ? "worldwide" : "US"} records — cite these, link /vendors/<id>):\n${JSON.stringify(top)}`;
    }
  } catch {
    // Search failed — assistant still answers general questions.
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL_FAST, // cheap, fast tier — chat is high-volume, low-stakes
        max_tokens: 600,
        system: SYSTEM + grounding,
        messages: clean,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "The assistant is busy — try again in a moment." }, { status: 502 });
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const reply = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return NextResponse.json({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" });
  } catch {
    return NextResponse.json({ error: "The assistant timed out — try again." }, { status: 504 });
  }
}
