/**
 * Phase 5 — Meeting recommender: POST { title, transcript } →
 * Claude extracts procurement needs → each need runs the combined
 * (private AVL + network) search → Claude ranks with grounded reasons →
 * saved report returned.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgForUser, listPrivateVendors, saveMeeting, listInspectors } from "@/lib/platform";
import { extractNeeds } from "@/lib/ai-extract";
import { rankVendors, recommendHire, aiAvailable } from "@/lib/ai";
import { searchVendors } from "@/lib/vendors";
import { jsonList, vendorLocation } from "@/lib/utils";

/** Pick the best-fit approved inspector for a job in a given location. */
function suggestInspector(location?: string) {
  const inspectors = listInspectors(true);
  if (inspectors.length === 0) return null;
  if (location) {
    const loc = location.toLowerCase();
    const regional = inspectors.find(
      (i) => i.house === 0 && i.regions && loc.split(/[\s,]+/).some((tok) => tok.length > 2 && i.regions!.toLowerCase().includes(tok))
    );
    if (regional) return { id: regional.id, company: regional.company, regions: regional.regions, house: false };
  }
  const house = inspectors.find((i) => i.house === 1) ?? inspectors[0];
  return { id: house.id, company: house.company, regions: house.regions, house: house.house === 1 };
}

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!aiAvailable()) {
    return NextResponse.json({ error: "AI is not configured on this deployment." }, { status: 503 });
  }

  let title = "", transcript = "";
  try {
    const body = (await request.json()) as { title?: string; transcript?: string };
    title = String(body.title ?? "Untitled meeting").slice(0, 120);
    transcript = String(body.transcript ?? "").trim();
  } catch { /* fall through */ }
  if (transcript.length < 40) {
    return NextResponse.json({ error: "Transcript is too short to analyze." }, { status: 400 });
  }

  const needs = await extractNeeds(transcript);
  if (!needs) return NextResponse.json({ error: "Could not analyze the transcript." }, { status: 502 });
  if (needs.length === 0) {
    return NextResponse.json({ error: "No procurement needs were mentioned in this meeting." }, { status: 422 });
  }

  const org = getOrgForUser(session.userId);

  // The pitch is "vendors you DIDN'T already have": anything whose name
  // matches the org's uploaded AVL is excluded from network suggestions
  // (it still appears in the clearly-labeled "on your AVL" list).
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const ownNames = new Set(
    org ? listPrivateVendors(org.id).map((p) => normName(p.name)) : []
  );

  const sections = [];
  for (const need of needs.slice(0, 8)) {
    // Network retrieval + AI rerank (grounded)
    const retrieval = await searchVendors({ q: need.query, sort: "relevance", page: 1 });
    const candidates = retrieval.vendors
      .filter((v) => !ownNames.has(normName(v.company_name)))
      .slice(0, 8);
    const ranked = await rankVendors(`${need.need}${need.specs ? ` — ${need.specs}` : ""}`, candidates);
    const byId = new Map(candidates.map((v) => [v.id, v]));
    const network = (ranked ?? candidates.map((v) => ({ id: v.id, match_score: 0, reasons: [], trust_level: v.completeness_status === "verified" ? "verified" : "listed" })))
      .slice(0, 4)
      .map((r) => {
        const v = byId.get(r.id);
        return v
          ? {
              id: v.id,
              name: v.company_name,
              location: vendorLocation(v),
              certifications: jsonList(v.certifications_held).slice(0, 4),
              score: r.match_score,
              reasons: r.reasons,
              trust: r.trust_level,
            }
          : null;
      })
      .filter(Boolean);

    // Private AVL matches (already-approved vendors), labeled separately
    const own = org
      ? listPrivateVendors(org.id, need.query.split(/\s+/).slice(0, 2).join(" ")).slice(0, 3).map((p) => ({
          name: p.name, location: p.location, capabilities: p.capabilities,
        }))
      : [];

    // The verdict: compare your AVL vs the network, name who to hire.
    const networkForRec = network
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => ({ id: v.id, name: v.name, location: v.location, certifications: v.certifications, trust: v.trust, reasons: v.reasons }));
    const recommendation = await recommendHire({
      need: need.need, specs: need.specs, location: need.location,
      yourAvl: own, network: networkForRec,
    });

    // Suggest an inspector when the verdict advises verification.
    const inspector = recommendation?.inspect ? suggestInspector(need.location) : null;

    sections.push({ ...need, network, onYourAvl: own, recommendation, inspector });
  }

  const report = { title, generatedAt: new Date().toISOString(), sections };
  const id = saveMeeting(session.userId, org?.id ?? null, title, transcript, report);
  return NextResponse.json({ id, report });
}
