import type { Metadata } from "next";
import { adminSearchVendors } from "@/lib/admin";
import { ApprovalQueue } from "@/components/admin/approval-queue";

export const metadata: Metadata = { title: "Approval Queue — Admin" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminApprovalPage({ searchParams }: Props) {
  const sp = await searchParams;

  const tier = sp.tier && sp.tier !== "any" ? Number(sp.tier) : undefined;
  const page = sp.page ? Number(sp.page) : 1;

  // Show vendors pending review: discovered + enriched, sorted by priority
  const result = adminSearchVendors({
    lifecycle: "discovered",
    tier,
    page,
    pageSize: 20,
    sort: "priority",
    sortDir: "desc",
  });

  // Also get enriched count
  const enrichedResult = adminSearchVendors({
    lifecycle: "enriched",
    tier,
    page: 1,
    pageSize: 1,
  });

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Approval Workflow</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg">
          Review Queue
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {result.total.toLocaleString()} discovered · {enrichedResult.total.toLocaleString()} enriched · Review the highest-priority vendors first
        </p>
      </div>

      <ApprovalQueue
        vendors={result.vendors}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        currentTier={tier}
      />
    </div>
  );
}
