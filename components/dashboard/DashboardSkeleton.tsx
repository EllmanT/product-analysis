import { Skeleton } from "@/components/ui/skeleton"

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border bg-card shadow-xs p-6 flex flex-col gap-3"
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-3 w-20 mt-1" />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="px-4 lg:px-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-2 border-b pb-3 mb-6">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </div>
  )
}

export function FilterBarSkeleton() {
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-end gap-4 rounded-md border bg-white p-4 lg:mx-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
      <div className="flex gap-3 ml-auto">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  )
}

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6 py-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-px mx-2" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <StatCardsSkeleton />

          {/* CTA skeleton */}
          <div className="px-4 lg:px-6">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>

          <FilterBarSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    </div>
  )
}
