import { Skeleton } from "@/components/skeleton";
import { OverviewHeaderSkeleton, StatsGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <OverviewHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
