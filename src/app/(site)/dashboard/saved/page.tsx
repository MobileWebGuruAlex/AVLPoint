import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getSavedVendors } from "@/lib/vendors";
import { VendorCard } from "@/components/vendor-card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Saved vendors" };

export default async function SavedVendorsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const saved = await getSavedVendors(session.userId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Shortlist</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg">
        Saved vendors
      </h1>
      <p className="mt-2 text-sm text-fg-secondary">
        {saved.length} vendor{saved.length === 1 ? "" : "s"} on your approved vendor list.
      </p>

      <div className="mt-8">
        {saved.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={24} />}
            title="Nothing saved yet"
            description="Vendors you shortlist will collect here, ready to export into your AVL."
            action={{ href: "/search", label: "Find vendors" }}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {saved.map((v) => (
              <VendorCard key={v.id} vendor={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
