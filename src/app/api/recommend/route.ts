/**
 * AI recommendation endpoint — POST /api/recommend { q: string }.
 *
 * Access tier T1+: AI explanations are a registered-account feature
 * (per the access-tier plan); anonymous callers get 401 with a friendly
 * signup pointer. Retrieval always comes from OUR database (FTS top-N),
 * then Claude ranks and explains — grounded, never generative.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchVendors } from "@/lib/vendors";
import { rankVendors, aiAvailable, AI_MODEL } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { jsonList, vendorLocation } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "AI recommendations require a free account.", signup: "/signup" },
      { status: 401 }
    );
  }

  let q = "";
  try {
    const body = (await request.json()) as { q?: string };
    q = String(body.q ?? "").trim().slice(0, 300);
  } catch {
    /* fall through */
  }
  if (q.length < 3) {
    return NextResponse.json({ error: "Describe what you need in a few words." }, { status: 400 });
  }

  if (!aiAvailable()) {
    return NextResponse.json(
      { error: "AI ranking is not configured on this deployment yet.", configured: false },
      { status: 503 }
    );
  }

  // Retrieve candidates from our own index — the model only ever reranks.
  const retrieval = await searchVendors({ q, sort: "relevance", page: 1 });
  const candidates = retrieval.vendors.slice(0, 10);
  const ranked = await rankVendors(q, candidates);
  if (!ranked) {
    return NextResponse.json({ error: "AI ranking failed — showing standard results." }, { status: 502 });
  }

  const byId = new Map(candidates.map((v) => [v.id, v]));
  return NextResponse.json({
    meta: { model: AI_MODEL, candidates: candidates.length, query: q },
    results: ranked
      .map((r) => {
        const v = byId.get(r.id);
        if (!v) return null;
        return {
          id: v.id,
          company_name: v.company_name,
          location: vendorLocation(v),
          certifications: jsonList(v.certifications_held).slice(0, 4),
          match_score: r.match_score,
          reasons: r.reasons,
          trust_level: r.trust_level,
        };
      })
      .filter(Boolean),
  });
}
