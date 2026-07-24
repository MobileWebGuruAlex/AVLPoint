/**
 * Image upload for profile builders (vendor owners, inspectors, staff).
 * Validates ownership, decodes with sharp (rejects non-images), resizes to
 * max 1920px, re-encodes as WebP, and stores under public/uploads/…
 * Returns { url } for use in vendor_profiles / inspector_profiles.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isVendorOwner } from "@/lib/platform";
import { db } from "@/lib/db";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const scope = String(form?.get("scope") ?? "");
  const id = String(form?.get("id") ?? "");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 8 MB." }, { status: 400 });
  }

  // Ownership check per scope
  if (scope === "vendor") {
    const vendorId = Number(id);
    if (!Number.isFinite(vendorId)) return NextResponse.json({ error: "Invalid vendor." }, { status: 400 });
    if (!isVendorOwner(vendorId, session.userId) && !can(session.role, "vendors.edit")) {
      return NextResponse.json({ error: "Not your profile." }, { status: 403 });
    }
  } else if (scope === "inspector") {
    const row = db.prepare("SELECT user_id FROM inspectors WHERE id = ?").get(id) as { user_id: string } | undefined;
    if (!row) return NextResponse.json({ error: "Inspector not found." }, { status: 404 });
    if (row.user_id !== session.userId && !can(session.role, "inspectors.manage")) {
      return NextResponse.json({ error: "Not your profile." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
  }

  try {
    const input = Buffer.from(await file.arrayBuffer());
    // sharp throws on anything that isn't a decodable image.
    const output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    const dir = path.join(process.cwd(), "public", "uploads", scope, safeId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.randomBytes(8).toString("hex")}.webp`;
    fs.writeFileSync(path.join(dir, name), output);

    return NextResponse.json({ url: `/uploads/${scope}/${safeId}/${name}` });
  } catch {
    return NextResponse.json({ error: "That file doesn't look like a valid image." }, { status: 400 });
  }
}
