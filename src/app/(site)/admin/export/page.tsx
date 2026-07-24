import type { Metadata } from "next";
import { ExportForm } from "@/components/admin/export-form";

export const metadata: Metadata = { title: "Export — Admin" };

export default function AdminExportPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Data</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">
          Export Vendors
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Download filtered vendor data as CSV or JSON.
        </p>
      </div>

      <ExportForm />
    </div>
  );
}
