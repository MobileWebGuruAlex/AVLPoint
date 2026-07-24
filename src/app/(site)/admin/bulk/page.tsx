import type { Metadata } from "next";
import { BulkActionPanel } from "@/components/admin/bulk-action-panel";

export const metadata: Metadata = { title: "Bulk Operations — Admin" };

export default function AdminBulkPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Operations</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">
          Bulk Operations
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Define a filter, preview the match set, then execute a bulk action.
        </p>
      </div>

      <BulkActionPanel />
    </div>
  );
}
