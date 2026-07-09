import { VendorCardSkeleton } from "@/components/vendor-card";
import { Skeleton } from "@/components/ui";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mx-auto mb-10 max-w-3xl space-y-4 text-center">
        <Skeleton className="mx-auto h-9 w-72" />
        <Skeleton className="mx-auto h-4 w-96 max-w-full" />
        <Skeleton className="mx-auto h-12 w-full rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <VendorCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
