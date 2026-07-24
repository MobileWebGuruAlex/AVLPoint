"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, Trash2, ExternalLink, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import { KeywordEditor } from "@/components/admin/keyword-editor";
import { cn, jsonList } from "@/lib/utils";
import type { VendorFullRow } from "@/lib/admin";
import { updateVendorAction, deleteVendorAction } from "@/lib/admin-actions";
import type { FormState } from "@/lib/actions";

interface Props {
  vendor: VendorFullRow;
}

export function VendorEditor({ vendor }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [changes, setChanges] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const hasChanges = Object.keys(changes).length > 0;

  const setField = (key: string, value: unknown) => {
    setChanges((prev) => ({ ...prev, [key]: value }));
  };

  const currentVal = (key: keyof VendorFullRow) => {
    if (key in changes) return changes[key];
    return vendor[key];
  };

  const currentList = (key: keyof VendorFullRow): string[] => {
    if (key in changes) {
      const v = changes[key];
      return Array.isArray(v) ? v : [];
    }
    return jsonList(vendor[key] as string | null);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    const formData = new FormData();
    formData.set("vendor_id", String(vendor.id));
    formData.set("changes", JSON.stringify(changes));
    const result = await updateVendorAction({} as FormState, formData);
    if (result.error) {
      setMessage({ type: "err", text: result.error });
    } else {
      setMessage({ type: "ok", text: result.success ?? "Saved." });
      setChanges({});
      startTransition(() => router.refresh());
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") return;
    const formData = new FormData();
    formData.set("vendor_id", String(vendor.id));
    formData.set("confirm", "DELETE");
    const result = await deleteVendorAction({} as FormState, formData);
    if (result.error) {
      setMessage({ type: "err", text: result.error });
    } else {
      router.push("/admin/vendors");
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link href="/admin/vendors" className="text-fg-muted hover:text-arc">
            <ArrowLeft size={18} />
          </Link>
          {hasChanges && (
            <Badge tone="warn">Unsaved changes ({Object.keys(changes).length} fields)</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {vendor.website_url && (
            <a
              href={vendor.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-arc"
              title="Visit website"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <Link
            href={`/vendors/${vendor.id}`}
            className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-arc"
            title="View public profile"
          >
            <ExternalLink size={15} />
          </Link>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasChanges || isPending}
            onClick={handleSave}
          >
            <Save size={14} /> Save
          </Button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
          message.type === "ok" ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/10 text-danger"
        )}>
          {message.type === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {message.text}
        </div>
      )}

      {/* === Sections === */}

      <Section title="Identity & Branding" defaultOpen>
        <FieldRow label="Company Name" field="company_name" value={currentVal("company_name")} onChange={setField} />
        <FieldRow label="Website URL" field="website_url" value={currentVal("website_url")} onChange={setField} />
        <FieldRow label="Logo URL" field="logo_url" value={currentVal("logo_url")} onChange={setField} />
        <FieldRow label="Thomasnet URL" field="thomasnet_profile_url" value={currentVal("thomasnet_profile_url")} onChange={setField} />
        <ArrayField label="Alternate Names" field="alternate_names" value={currentList("alternate_names")} onChange={setField} />
      </Section>

      <Section title="Location">
        <FieldRow label="Street Address" field="street_address" value={currentVal("street_address")} onChange={setField} />
        <FieldRow label="City" field="city" value={currentVal("city")} onChange={setField} />
        <FieldRow label="State/Province" field="state_province" value={currentVal("state_province")} onChange={setField} />
        <FieldRow label="Country" field="country" value={currentVal("country")} onChange={setField} />
        <FieldRow label="ZIP/Postal" field="zip_postal_code" value={currentVal("zip_postal_code")} onChange={setField} />
        <FieldRow label="HQ Location" field="headquarters_location" value={currentVal("headquarters_location")} onChange={setField} />
        <ArrayField label="Service Areas" field="geographic_service_areas" value={currentList("geographic_service_areas")} onChange={setField} />
      </Section>

      <Section title="Contact">
        <FieldRow label="Email" field="contact_email" value={currentVal("contact_email")} onChange={setField} />
        <FieldRow label="Phone" field="contact_phone" value={currentVal("contact_phone")} onChange={setField} />
        <FieldRow label="Contact Form URL" field="contact_form_url" value={currentVal("contact_form_url")} onChange={setField} />
        <ArrayField label="Key Personnel" field="key_personnel" value={currentList("key_personnel")} onChange={setField} />
      </Section>

      <Section title="Business Profile">
        <FieldRow label="Business Type" field="primary_business_type" value={currentVal("primary_business_type")} onChange={setField} />
        <TextareaField label="Description" field="company_description" value={currentVal("company_description")} onChange={setField} />
        <TextareaField label="AI Summary" field="ai_summary" value={currentVal("ai_summary")} onChange={setField} />
        <TextareaField label="AI Synopsis" field="ai_synopsis" value={currentVal("ai_synopsis")} onChange={setField} />
        <FieldRow label="Year Established" field="year_established" value={currentVal("year_established")} onChange={setField} />
        <FieldRow label="Employee Count" field="employee_count" value={currentVal("employee_count")} onChange={setField} />
        <FieldRow label="Facility Size (sqft)" field="facility_size_sqft" value={currentVal("facility_size_sqft")} onChange={setField} />
        <FieldRow label="Revenue Estimate" field="annual_revenue_estimate" value={currentVal("annual_revenue_estimate")} onChange={setField} />
        <FieldRow label="Shop Capacity" field="shop_capacity" value={currentVal("shop_capacity")} onChange={setField} />
        <FieldRow label="Lead Times" field="lead_times" value={currentVal("lead_times")} onChange={setField} />
      </Section>

      <Section title="Capabilities & Services">
        <ArrayField label="Services" field="services" value={currentList("services")} onChange={setField} />
        <ArrayField label="Capabilities" field="capabilities" value={currentList("capabilities")} onChange={setField} />
        <ArrayField label="Welding Processes" field="welding_processes" value={currentList("welding_processes")} onChange={setField} />
        <ArrayField label="Fabrication Capabilities" field="fabrication_capabilities" value={currentList("fabrication_capabilities")} onChange={setField} />
        <ArrayField label="Materials Handled" field="materials_handled" value={currentList("materials_handled")} onChange={setField} />
        <ArrayField label="Equipment List" field="equipment_list" value={currentList("equipment_list")} onChange={setField} />
        <ArrayField label="Technical Specialties" field="technical_specialties" value={currentList("technical_specialties")} onChange={setField} />
        <ArrayField label="QA Capabilities" field="inspection_and_qa_capabilities" value={currentList("inspection_and_qa_capabilities")} onChange={setField} />
      </Section>

      <Section title="Taxonomy & Keywords" defaultOpen>
        <ArrayField label="Keywords" field="keywords" value={currentList("keywords")} onChange={setField} highlight />
        <ArrayField label="Search Tags" field="search_tags" value={currentList("search_tags")} onChange={setField} highlight />
        <ArrayField label="Vendor Categories" field="vendor_categories" value={currentList("vendor_categories")} onChange={setField} />
        <ArrayField label="Project Types" field="project_types" value={currentList("project_types")} onChange={setField} />
        <ArrayField label="Use Cases" field="use_cases" value={currentList("use_cases")} onChange={setField} />
        <ArrayField label="Sub-Industries" field="sub_industries" value={currentList("sub_industries")} onChange={setField} />
        <ArrayField label="Industries Served" field="industries_served" value={currentList("industries_served")} onChange={setField} />
      </Section>

      <Section title="Certifications">
        <ArrayField label="Certifications Held" field="certifications_held" value={currentList("certifications_held")} onChange={setField} />
        <BooleanField label="ISO 9001" field="iso_9001" value={!!currentVal("iso_9001")} onChange={setField} />
        <BooleanField label="AS9100" field="as9100" value={!!currentVal("as9100")} onChange={setField} />
        <BooleanField label="ITAR Registered" field="itar_registered" value={!!currentVal("itar_registered")} onChange={setField} />
        <FieldRow label="CAGE Code" field="cage_code" value={currentVal("cage_code")} onChange={setField} />
        <FieldRow label="DUNS Number" field="duns_number" value={currentVal("duns_number")} onChange={setField} />
        <FieldRow label="Cybersecurity" field="cybersecurity_compliance" value={currentVal("cybersecurity_compliance")} onChange={setField} />
        <ArrayField label="Memberships" field="memberships" value={currentList("memberships")} onChange={setField} />
      </Section>

      <Section title="Relationships">
        <ArrayField label="Partnerships & Dealers" field="partnerships_and_dealers" value={currentList("partnerships_and_dealers")} onChange={setField} />
        <ArrayField label="Notable Customers" field="notable_customers" value={currentList("notable_customers")} onChange={setField} />
        <ArrayField label="Products" field="products" value={currentList("products")} onChange={setField} />
      </Section>

      <Section title="Scoring & Lifecycle" defaultOpen>
        <SelectField
          label="Enterprise Tier"
          field="enterprise_tier"
          value={String(currentVal("enterprise_tier") ?? 0)}
          options={[
            { value: "0", label: "0 — Unassessed" },
            { value: "1", label: "1 — Enterprise" },
            { value: "2", label: "2 — Regional" },
            { value: "3", label: "3 — Small/Unclear" },
          ]}
          onChange={(v) => setField("enterprise_tier", Number(v))}
        />
        <SelectField
          label="Lifecycle Stage"
          field="lifecycle_stage"
          value={String(currentVal("lifecycle_stage") ?? "discovered")}
          options={[
            { value: "discovered", label: "Discovered" },
            { value: "enriched", label: "Enriched" },
            { value: "fully_built", label: "Fully Built" },
            { value: "locked", label: "Locked (Approved)" },
            { value: "disqualified", label: "Disqualified" },
          ]}
          onChange={(v) => setField("lifecycle_stage", v)}
        />
        <SelectField
          label="Completeness"
          field="completeness_status"
          value={String(currentVal("completeness_status") ?? "incomplete")}
          options={[
            { value: "incomplete", label: "Incomplete" },
            { value: "verified", label: "Verified" },
          ]}
          onChange={(v) => setField("completeness_status", v)}
        />
        <SelectField
          label="Confidence"
          field="confidence_level"
          value={String(currentVal("confidence_level") ?? "unconfirmed")}
          options={[
            { value: "verified", label: "Verified" },
            { value: "partial", label: "Partial" },
            { value: "inferred", label: "Inferred" },
            { value: "unconfirmed", label: "Unconfirmed" },
          ]}
          onChange={(v) => setField("confidence_level", v)}
        />
        <FieldRow label="Suitability Score" field="enterprise_suitability_score" value={currentVal("enterprise_suitability_score")} onChange={setField} type="number" />
        <FieldRow label="Priority Score" field="dynamic_priority_score" value={currentVal("dynamic_priority_score")} onChange={setField} type="number" />
        <ReadOnlyField label="Enrichment Attempts" value={String(vendor.enrichment_attempts ?? 0)} />
        <ReadOnlyField label="Data Source" value={vendor.data_source ?? "—"} />
      </Section>

      <Section title="AI Enrichment Data (read-only)">
        <JsonPreview label="AI Metadata" value={vendor.ai_metadata_data} />
        <JsonPreview label="Identity Data" value={vendor.identity_data} />
        <JsonPreview label="Business Data" value={vendor.business_data} />
        <JsonPreview label="Capabilities Data" value={vendor.capabilities_data} />
        <JsonPreview label="Certifications Data" value={vendor.certifications_data} />
        <JsonPreview label="Relationships Data" value={vendor.relationships_data} />
      </Section>

      {/* Delete zone */}
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
        <h3 className="font-display text-sm font-semibold text-danger">Danger Zone</h3>
        {!showDelete ? (
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setShowDelete(true)}>
            <Trash2 size={14} /> Delete this vendor permanently
          </Button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-danger">
              This will permanently delete <strong>{vendor.company_name}</strong> and all related records.
              Type <code className="rounded bg-danger/10 px-1">DELETE</code> to confirm.
            </p>
            <div className="flex gap-2">
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="max-w-[200px] border-danger/40"
              />
              <Button
                variant="danger"
                size="sm"
                disabled={deleteConfirm !== "DELETE"}
                onClick={handleDelete}
              >
                Confirm Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Sub-components
   ================================================================ */

function Section({
  title, defaultOpen = false, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <h2 className="font-display text-sm font-semibold text-fg">{title}</h2>
        {open ? <ChevronDown size={16} className="text-fg-muted" /> : <ChevronRight size={16} className="text-fg-muted" />}
      </button>
      {open && <div className="space-y-3 border-t border-line px-5 py-4">{children}</div>}
    </div>
  );
}

function FieldRow({
  label, field, value, onChange, type = "text",
}: {
  label: string; field: string; value: unknown; onChange: (k: string, v: unknown) => void; type?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 shrink-0 text-xs font-medium text-fg-secondary">{label}</label>
      <Input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(field, type === "number" ? Number(e.target.value) : e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function TextareaField({
  label, field, value, onChange,
}: {
  label: string; field: string; value: unknown; onChange: (k: string, v: unknown) => void;
}) {
  return (
    <div className="flex gap-3">
      <label className="w-40 shrink-0 pt-1 text-xs font-medium text-fg-secondary">{label}</label>
      <textarea
        value={String(value ?? "")}
        onChange={(e) => onChange(field, e.target.value)}
        rows={3}
        className="w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-fg-muted focus:border-arc/60 focus:outline-none"
      />
    </div>
  );
}

function ArrayField({
  label, field, value, onChange, highlight = false,
}: {
  label: string; field: string; value: string[]; onChange: (k: string, v: unknown) => void; highlight?: boolean;
}) {
  return (
    <div className={cn("flex gap-3", highlight && "rounded-lg bg-arc/5 p-2 -mx-2")}>
      <label className="w-40 shrink-0 pt-1 text-xs font-medium text-fg-secondary">{label}</label>
      <KeywordEditor
        values={value}
        onChange={(newVals) => onChange(field, newVals)}
      />
    </div>
  );
}

function BooleanField({
  label, field, value, onChange,
}: {
  label: string; field: string; value: boolean; onChange: (k: string, v: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 shrink-0 text-xs font-medium text-fg-secondary">{label}</label>
      <button
        onClick={() => onChange(field, !value)}
        className={cn(
          "h-6 w-11 rounded-full transition-colors",
          value ? "bg-ok" : "bg-surface-3"
        )}
      >
        <span
          className={cn(
            "block h-5 w-5 rounded-full bg-white shadow transition-transform",
            value ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
      <span className="text-xs text-fg-muted">{value ? "Yes" : "No"}</span>
    </div>
  );
}

function SelectField({
  label, field, value, options, onChange,
}: {
  label: string; field: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 shrink-0 text-xs font-medium text-fg-secondary">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg focus:border-arc/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 shrink-0 text-xs font-medium text-fg-secondary">{label}</label>
      <span className="font-mono text-xs text-fg-muted">{value}</span>
    </div>
  );
}

function JsonPreview({ label, value }: { label: string; value: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!value || value === "{}" || value === "[]") {
    return (
      <div className="flex items-center gap-3">
        <label className="w-40 shrink-0 text-xs font-medium text-fg-secondary">{label}</label>
        <span className="font-mono text-xs text-fg-muted">Empty</span>
      </div>
    );
  }

  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    formatted = value;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-fg-secondary hover:text-arc"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label} ({value.length} chars)
      </button>
      {expanded && (
        <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[10px] text-fg-muted">
          {formatted}
        </pre>
      )}
    </div>
  );
}
