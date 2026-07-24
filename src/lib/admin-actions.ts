"use server";

/**
 * Admin-only server actions.
 * Every action re-derives identity from the session — client input is never
 * trusted for user/org identity. Non-admins are always rejected.
 */
import { revalidatePath } from "next/cache";
import { getSession } from "./auth";
import type { FormState } from "./actions";
import { can, type Permission } from "./rbac";
import {
  updateVendor,
  deleteVendor,
  setLifecycleStage,
  bulkSetLifecycleStage,
  bulkDisqualifyByFilter,
  bulkDeleteByFilter,
  updateJsonArrayField,
  bulkAddToJsonArray,
  bulkRemoveFromJsonArray,
  countVendorsByFilter,
  sampleVendorsByFilter,
  type AdminFilters,
} from "./admin";
import {
  sleepVendor, wakeVendor, bulkSleepVendors, bulkWakeVendors,
} from "./states";

/* ---------- helpers ---------- */

/**
 * Gate a server action behind one RBAC permission. Identity always comes
 * from the session (live DB role) — never from client input.
 */
async function requirePermission(perm: Permission) {
  const session = await getSession();
  if (!session) return { error: "Sign in first.", admin: null as never };
  if (!can(session.role, perm)) {
    return { error: "You don't have permission for this action.", admin: null as never };
  }
  return { error: null, admin: { userId: session.userId, email: session.email } };
}

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

/* ================================================================
   Vendor CRUD
   ================================================================ */

export async function updateVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.edit");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };

  // Parse the changes JSON
  const changesRaw = formData.get("changes");
  let changes: Record<string, unknown>;
  try {
    changes = JSON.parse(String(changesRaw ?? "{}"));
    if (typeof changes !== "object" || changes === null) throw new Error();
  } catch {
    return { error: "Invalid changes data." };
  }

  const result = updateVendor(id, changes, admin);
  if (!result.success) return { error: result.error ?? "Update failed." };

  revalidateAdmin();
  revalidatePath(`/vendors/${id}`);
  return { success: "Vendor updated." };
}

export async function deleteVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.delete");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };

  const confirm = formData.get("confirm");
  if (confirm !== "DELETE") return { error: "Type DELETE to confirm." };

  const result = deleteVendor(id, admin);
  if (!result.success) return { error: result.error ?? "Delete failed." };

  revalidateAdmin();
  return { success: "Vendor permanently deleted." };
}

/* ================================================================
   Approval workflow
   ================================================================ */

export async function approveVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };

  const result = setLifecycleStage(id, "locked", admin);
  if (!result.success) return { error: result.error ?? "Approve failed." };

  revalidateAdmin();
  return { success: "Vendor approved (locked)." };
}

export async function rejectVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };

  const result = setLifecycleStage(id, "disqualified", admin);
  if (!result.success) return { error: result.error ?? "Reject failed." };

  revalidateAdmin();
  return { success: "Vendor rejected (disqualified)." };
}

export async function bulkApproveAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  let ids: number[];
  try {
    ids = JSON.parse(String(formData.get("vendor_ids") ?? "[]"));
    if (!Array.isArray(ids)) throw new Error();
  } catch {
    return { error: "Invalid vendor IDs." };
  }

  if (ids.length === 0) return { error: "No vendors selected." };
  if (ids.length > 500) return { error: "Maximum 500 vendors per batch." };

  const affected = bulkSetLifecycleStage(ids, "locked", admin);
  revalidateAdmin();
  return { success: `${affected} vendors approved.` };
}

export async function bulkRejectAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  let ids: number[];
  try {
    ids = JSON.parse(String(formData.get("vendor_ids") ?? "[]"));
    if (!Array.isArray(ids)) throw new Error();
  } catch {
    return { error: "Invalid vendor IDs." };
  }

  if (ids.length === 0) return { error: "No vendors selected." };
  if (ids.length > 500) return { error: "Maximum 500 vendors per batch." };

  const affected = bulkSetLifecycleStage(ids, "disqualified", admin);
  revalidateAdmin();
  return { success: `${affected} vendors rejected.` };
}

/* ================================================================
   Bulk operations by filter
   ================================================================ */

function parseFilters(formData: FormData): AdminFilters {
  const f: AdminFilters = {};
  const tier = formData.get("tier");
  if (tier !== null && tier !== "" && tier !== "any") f.tier = Number(tier);
  const lifecycle = String(formData.get("lifecycle") ?? "");
  if (lifecycle && lifecycle !== "any") f.lifecycle = lifecycle;
  const completeness = String(formData.get("completeness") ?? "");
  if (completeness && completeness !== "any") f.completeness = completeness;
  const confidence = String(formData.get("confidence") ?? "");
  if (confidence && confidence !== "any") f.confidence = confidence;
  const country = String(formData.get("country") ?? "");
  if (country && country !== "any") f.country = country;
  const businessType = String(formData.get("businessType") ?? "");
  if (businessType && businessType !== "any") f.businessType = businessType;
  const dataSource = String(formData.get("dataSource") ?? "");
  if (dataSource && dataSource !== "any") f.dataSource = dataSource;
  const hasWebsite = formData.get("hasWebsite");
  if (hasWebsite === "yes") f.hasWebsite = true;
  else if (hasWebsite === "no") f.hasWebsite = false;
  const hasEmail = formData.get("hasEmail");
  if (hasEmail === "yes") f.hasEmail = true;
  else if (hasEmail === "no") f.hasEmail = false;
  const state = String(formData.get("state") ?? "");
  if (state === "awake" || state === "sleeping") f.sleepState = state;
  const q = String(formData.get("q") ?? "").trim();
  if (q) f.q = q;
  return f;
}

export async function bulkDisqualifyByFilterAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  const filters = parseFilters(formData);
  const expectedCount = Number(formData.get("expected_count") ?? 0);
  const confirmCount = Number(formData.get("confirm_count") ?? -1);

  if (expectedCount > 0 && confirmCount !== expectedCount) {
    return { error: `Type the exact count (${expectedCount}) to confirm.` };
  }

  const affected = bulkDisqualifyByFilter(filters, admin);
  revalidateAdmin();
  return { success: `${affected} vendors disqualified.` };
}

export async function bulkDeleteByFilterAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.delete");
  if (error) return { error };

  const filters = parseFilters(formData);
  const expectedCount = Number(formData.get("expected_count") ?? 0);
  const confirmCount = Number(formData.get("confirm_count") ?? -1);

  if (expectedCount > 0 && confirmCount !== expectedCount) {
    return { error: `Type the exact count (${expectedCount}) to confirm.` };
  }

  const affected = bulkDeleteByFilter(filters, admin);
  revalidateAdmin();
  return { success: `${affected} vendors permanently deleted.` };
}

/* ================================================================
   Keyword / taxonomy
   ================================================================ */

export async function updateKeywordsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.edit");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  const field = String(formData.get("field") ?? "");
  let values: string[];
  try {
    values = JSON.parse(String(formData.get("values") ?? "[]"));
    if (!Array.isArray(values)) throw new Error();
  } catch {
    return { error: "Invalid values." };
  }

  const result = updateJsonArrayField(id, field, values, admin);
  if (!result.success) return { error: result.error ?? "Update failed." };

  revalidateAdmin();
  revalidatePath(`/vendors/${id}`);
  return { success: `${field} updated.` };
}

export async function bulkAddKeywordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.edit");
  if (error) return { error };

  const filters = parseFilters(formData);
  const field = String(formData.get("field") ?? "keywords");
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return { error: "Enter a keyword to add." };

  const affected = bulkAddToJsonArray(filters, field, value, admin);
  revalidateAdmin();
  return { success: `Added "${value}" to ${field} on ${affected} vendors.` };
}

export async function bulkRemoveKeywordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.edit");
  if (error) return { error };

  const filters = parseFilters(formData);
  const field = String(formData.get("field") ?? "keywords");
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return { error: "Enter a keyword to remove." };

  const affected = bulkRemoveFromJsonArray(filters, field, value, admin);
  revalidateAdmin();
  return { success: `Removed "${value}" from ${field} on ${affected} vendors.` };
}

/* ================================================================
   Quick lifecycle toggle (used in vendor table rows)
   ================================================================ */

export async function quickLifecycleAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.lifecycle");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  const stage = String(formData.get("stage") ?? "");

  const result = setLifecycleStage(id, stage, admin);
  if (!result.success) return { error: result.error ?? "Update failed." };

  revalidateAdmin();
  return { success: `Vendor ${stage === "locked" ? "approved" : stage === "disqualified" ? "rejected" : "updated"}.` };
}

/* ================================================================
   Sleep / wake (reversible disable)
   ================================================================ */

export async function sleepVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.sleep");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };
  const reason = String(formData.get("reason") ?? "").slice(0, 300);

  const result = sleepVendor(id, reason, admin);
  if (!result.success) return { error: result.error ?? "Sleep failed." };

  revalidateAdmin();
  revalidatePath(`/vendors/${id}`);
  revalidatePath("/search");
  return { success: "Vendor is now sleeping — hidden everywhere user-facing, fully recoverable." };
}

export async function wakeVendorAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.sleep");
  if (error) return { error };

  const id = Number(formData.get("vendor_id"));
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid vendor ID." };

  const result = wakeVendor(id, admin);
  if (!result.success) return { error: result.error ?? "Wake failed." };

  revalidateAdmin();
  revalidatePath(`/vendors/${id}`);
  revalidatePath("/search");
  return { success: "Vendor is awake and visible again." };
}

export async function bulkSleepAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.sleep");
  if (error) return { error };

  let ids: number[];
  try {
    ids = JSON.parse(String(formData.get("vendor_ids") ?? "[]"));
    if (!Array.isArray(ids)) throw new Error();
  } catch {
    return { error: "Invalid vendor IDs." };
  }
  if (ids.length === 0) return { error: "No vendors selected." };
  if (ids.length > 500) return { error: "Maximum 500 vendors per batch." };

  const reason = String(formData.get("reason") ?? "").slice(0, 300);
  const affected = bulkSleepVendors(ids, reason, admin);
  revalidateAdmin();
  revalidatePath("/search");
  return { success: `${affected} vendors put to sleep (reversible).` };
}

export async function bulkWakeAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.sleep");
  if (error) return { error };

  let ids: number[];
  try {
    ids = JSON.parse(String(formData.get("vendor_ids") ?? "[]"));
    if (!Array.isArray(ids)) throw new Error();
  } catch {
    return { error: "Invalid vendor IDs." };
  }
  if (ids.length === 0) return { error: "No vendors selected." };

  const affected = bulkWakeVendors(ids, admin);
  revalidateAdmin();
  revalidatePath("/search");
  return { success: `${affected} vendors woken.` };
}

/** Filter-based bulk sleep — the safe alternative to bulk delete. */
export async function bulkSleepByFilterAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { error, admin } = await requirePermission("vendors.sleep");
  if (error) return { error };

  const filters = parseFilters(formData);
  const expectedCount = Number(formData.get("expected_count") ?? 0);
  const confirmCount = Number(formData.get("confirm_count") ?? -1);
  if (expectedCount > 0 && confirmCount !== expectedCount) {
    return { error: `Type the exact count (${expectedCount}) to confirm.` };
  }

  const total = countVendorsByFilter(filters);
  if (total === 0) return { error: "No vendors match this filter." };
  if (total > 20000) return { error: "Filter matches over 20,000 vendors — narrow it down first." };

  // Page through matches in id batches to keep each transaction short
  // (the discovery pipeline shares this database).
  const reason = String(formData.get("reason") ?? "").slice(0, 300) || "bulk filter sleep";
  let affected = 0;
  for (;;) {
    const batch = sampleVendorsByFilter({ ...filters, sleepState: "awake" }, 1000).map((v) => v.id);
    if (batch.length === 0) break;
    affected += bulkSleepVendors(batch, reason, admin);
    if (batch.length < 1000) break;
  }

  revalidateAdmin();
  revalidatePath("/search");
  return { success: `${affected} vendors put to sleep (reversible).` };
}
