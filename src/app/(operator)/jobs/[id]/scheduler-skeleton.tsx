import { Skeleton } from "@/components/ui";

export function SchedulerSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border-line bg-surface overflow-hidden rounded-[var(--radius-lg)] border" aria-busy="true">
      <div className="bg-surface-alt border-line flex h-16 border-b">
        <div className="border-line w-[248px] border-r" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-line flex h-[58px] items-center border-b last:border-b-0">
          <div className="border-line flex h-full w-[248px] shrink-0 items-center gap-2.5 border-r px-4">
            <Skeleton className="size-[30px] rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="ml-10 h-[34px] w-64 rounded-[8px]" />
        </div>
      ))}
      <span className="sr-only">Loading schedule…</span>
    </div>
  );
}
