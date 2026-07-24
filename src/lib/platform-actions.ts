"use server";

/**
 * Server actions for Phases 3–5 + Phase 1 leftovers.
 * Kept separate from actions.ts to avoid churn in the auth file.
 * Every action re-derives identity from the session — client input is
 * never trusted for user/org identity.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import type { FormState } from "./actions";
import {
  createOrg, getOrgForUser, addOrgMember, insertPrivateVendors, createAuditRequest,
  applyInspector, createInspectionRequest, advanceInspection, fileInspectionReport,
  resolveClaim, isVendorOwner, upsertEnrichment, orgIsActive,
} from "./platform";
import { can } from "./rbac";
import { getVendorById } from "./vendors";
import {
  getPendingClaim, checkWebsiteForToken, approveClaim, upsertVendorProfile,
} from "./profiles";
import type { ExtractedVendor } from "./ai-extract";

/* ---------------- Phase 3: sandbox ---------------- */

export async function createOrgAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give your workspace a name." };
  if (getOrgForUser(session.userId)) return { error: "You already belong to a workspace." };
  try {
    createOrg(session.userId, session.email, name.slice(0, 80));
  } catch {
    return { error: "Could not create the workspace." };
  }
  revalidatePath("/sandbox");
  return { success: "Workspace created." };
}

export async function addMemberAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const org = getOrgForUser(session.userId);
  if (!org || org.role !== "admin") return { error: "Only workspace admins can invite members." };
  if (!orgIsActive(org.id)) return { error: "This workspace is paused — contact AVLpoint support." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  const err = addOrgMember(org.id, email);
  if (err) return { error: err };
  revalidatePath("/sandbox");
  return { success: `${email} added to ${org.name}.` };
}

/** Commit human-reviewed ingest rows into the org's private AVL. */
export async function commitIngestAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const org = getOrgForUser(session.userId);
  if (!org) return { error: "Create a workspace first." };
  if (!orgIsActive(org.id)) return { error: "This workspace is paused — contact AVLpoint support." };
  let rows: ExtractedVendor[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "Invalid review data." };
  }
  const source = String(formData.get("source") ?? "upload").slice(0, 120);
  const n = insertPrivateVendors(org.id, rows.slice(0, 300), source);
  revalidatePath("/sandbox");
  return { success: `${n} vendors added to your private AVL.` };
}

export async function requestAuditAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const org = getOrgForUser(session.userId);
  if (!org) return { error: "Create a workspace first." };
  if (!orgIsActive(org.id)) return { error: "This workspace is paused — contact AVLpoint support." };
  const vendorId = Number(formData.get("vendor_id"));
  const vendor = Number.isFinite(vendorId) ? await getVendorById(vendorId) : null;
  if (!vendor) return { error: "Vendor not found." };
  createAuditRequest(org.id, vendorId, session.userId, String(formData.get("note") ?? "").slice(0, 400));
  revalidatePath("/sandbox");
  return { success: `Audit requested for ${vendor.company_name}. We'll follow up with a quote.` };
}

/* ---------------- Phase 4: inspections ---------------- */

export async function applyInspectorAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const company = String(formData.get("company") ?? "").trim();
  if (company.length < 2) return { error: "Enter your company name." };
  applyInspector(
    session.userId,
    company.slice(0, 120),
    String(formData.get("credentials") ?? "").slice(0, 300),
    String(formData.get("regions") ?? "").slice(0, 200),
    String(formData.get("base_price") ?? "").slice(0, 80)
  );
  return { success: "Application received — credentials are reviewed manually before listing (badge integrity depends on it)." };
}

export async function requestInspectionAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const vendorId = Number(formData.get("vendor_id"));
  const inspectorId = String(formData.get("inspector_id") ?? "");
  const vendor = Number.isFinite(vendorId) ? await getVendorById(vendorId) : null;
  if (!vendor) return { error: "Enter a valid vendor ID (from the vendor's profile URL)." };
  if (!inspectorId) return { error: "Choose an inspector." };
  createInspectionRequest(vendorId, vendor.company_name, session.userId, inspectorId);
  revalidatePath("/inspections/requests");
  return { success: `Inspection requested for ${vendor.company_name}.` };
}

export async function advanceInspectionAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const err = advanceInspection(
    String(formData.get("request_id") ?? ""),
    session.userId,
    can(session.role, "inspectors.manage"),
    String(formData.get("next") ?? ""),
    {
      quote: String(formData.get("quote") ?? "").slice(0, 80) || undefined,
      scheduledFor: String(formData.get("scheduled_for") ?? "").slice(0, 40) || undefined,
    }
  );
  if (err) return { error: err };
  revalidatePath("/inspections/requests");
  return { success: "Status updated." };
}

export async function fileReportAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const outcome = formData.get("outcome") === "passed" ? "passed" : "failed";
  const checklist: Record<string, boolean> = {};
  for (const key of ["facility", "equipment", "weld_qa", "documentation", "certifications", "safety"]) {
    checklist[key] = formData.get(`chk_${key}`) === "on";
  }
  const err = fileInspectionReport(
    String(formData.get("request_id") ?? ""),
    session.userId,
    checklist,
    String(formData.get("notes") ?? "").slice(0, 2000),
    outcome
  );
  if (err) return { error: err };
  revalidatePath("/inspections/requests");
  return {
    success:
      outcome === "passed"
        ? "Report filed — vendor is now Level 1 Certified (expires in 12 months)."
        : "Report filed as failed.",
  };
}

/* ---------------- Phase 1 leftovers ---------------- */

export async function resolveClaimAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session || !can(session.role, "vendors.edit")) return { error: "Admins only." };
  const err = resolveClaim(String(formData.get("claim_id") ?? ""), formData.get("decision") === "approve");
  if (err) return { error: err };
  revalidatePath("/admin");
  return { success: "Claim resolved." };
}

/**
 * Website-token claim verification: fetches the company site and looks for
 * the claimant's unique code. Success grants ownership instantly.
 */
export async function verifyClaimAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };

  const vendorId = Number(formData.get("vendor_id"));
  if (!Number.isFinite(vendorId)) return { error: "Invalid vendor." };

  const claim = getPendingClaim(vendorId, session.userId);
  if (!claim) return { error: "No open claim found for this company on your account." };
  if (!claim.verify_token) return { error: "This claim predates website verification — it's in the manual review queue." };

  const vendor = await getVendorById(vendorId);
  if (!vendor?.website_url) {
    return { error: "This company has no website on file, so website verification isn't possible — your claim stays in manual review." };
  }

  const result = await checkWebsiteForToken(vendor.website_url, claim.verify_token);
  if (!result.found) {
    return {
      error:
        result.error ??
        `Code not found yet. We checked ${result.checked.map((u) => new URL(u).pathname === "/" ? "your homepage" : new URL(u).pathname).join(" and ")}. Place the code anywhere in your homepage HTML or in /avlpoint-verify.txt, wait for any site cache to clear, and try again.`,
    };
  }

  approveClaim(claim, "website_token", { userId: session.userId, email: session.email });
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/admin");
  return { success: `Verified! You now own ${vendor.company_name} — the profile builder below is unlocked.` };
}

/** Owner (or staff) saves the public card/page customization. */
export async function updateVendorProfileAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };

  const vendorId = Number(formData.get("vendor_id"));
  if (!Number.isFinite(vendorId)) return { error: "Invalid vendor." };
  const isOwner = isVendorOwner(vendorId, session.userId);
  if (!isOwner && !can(session.role, "vendors.edit")) {
    return { error: "Only the verified profile owner can customize this page." };
  }

  let gallery: string[] = [];
  let highlights: { label: string; value: string }[] = [];
  try {
    gallery = JSON.parse(String(formData.get("gallery") ?? "[]"));
    highlights = JSON.parse(String(formData.get("highlights") ?? "[]"));
    if (!Array.isArray(gallery) || !Array.isArray(highlights)) throw new Error();
  } catch {
    return { error: "Invalid gallery or highlights data." };
  }

  upsertVendorProfile(
    vendorId,
    {
      template: String(formData.get("template") ?? "classic"),
      accent: String(formData.get("accent") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      about: String(formData.get("about") ?? ""),
      bannerImage: String(formData.get("banner_image") ?? ""),
      gallery,
      highlights,
    },
    session.email
  );
  revalidatePath(`/vendors/${vendorId}`);
  return { success: "Profile published — your page and card now use your branding." };
}

export async function ownerEnrichAction(_p: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const vendorId = Number(formData.get("vendor_id"));
  if (!Number.isFinite(vendorId) || !isVendorOwner(vendorId, session.userId)) {
    return { error: "Only the approved profile owner can edit this." };
  }
  upsertEnrichment(
    vendorId,
    session.userId,
    String(formData.get("summary") ?? "").slice(0, 1500),
    String(formData.get("capabilities") ?? "").slice(0, 600)
  );
  revalidatePath(`/vendors/${vendorId}`);
  return { success: "Profile updated — shown as first-party, owner-provided data." };
}
