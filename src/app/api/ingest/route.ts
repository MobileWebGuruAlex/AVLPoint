/**
 * Phase 3 — AVL ingest: POST multipart file → Claude extraction → rows for
 * the human review table. Nothing touches the database until the user
 * approves rows (commitIngestAction).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgForUser } from "@/lib/platform";
import { extractVendorsFromFile } from "@/lib/ai-extract";

export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!getOrgForUser(session.userId)) {
    return NextResponse.json({ error: "Create a workspace first." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: "File too large (8MB max)." }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractVendorsFromFile(buffer, file.type || "text/plain", file.name);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ source: file.name, vendors: result.vendors });
}
