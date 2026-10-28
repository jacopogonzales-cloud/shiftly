import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb, buttonClass, Card, JobStatusPill, Skeleton } from "@/components/ui";
import { jobRef } from "@/lib/format";
import { getHours } from "@/lib/hours-data";
import { HoursSheet } from "./hours-sheet";

export const metadata: Metadata = { title: "Hours" };

export default function HoursPage({ params }: PageProps<"/jobs/[id]/hours">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="mt-6 space-y-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-[92px] rounded-[var(--radius-lg)]" />
          <Skeleton className="h-[420px] rounded-[var(--radius-lg)]" />
        </div>
      }
    >
      <Hours params={params} />
    </Suspense>
  );
}

async function Hours({ params }: { params: Promise<{ id: string }> }) {
  const jobId = Number((await params).id);
  if (!Number.isInteger(jobId) || jobId <= 0) notFound();
  const data = await getHours(jobId);
  if (!data) notFound();
  const { job, rows, flags, overtimeAfterMinutes } = data;
  const editable = job.status === "IN_PROGRESS";

  return (
    <>
      <Breadcrumb items={[{ label: "Jobs", href: "/jobs" }, { label: jobRef(job.id), href: `/jobs/${job.id}` }, { label: "Hours" }]} />
      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">{editable ? "Approve hours" : "Hours"}</h1>
          <p className="text-ink-muted mt-1.5 flex items-center gap-2 text-[14px]">
            {job.title} <JobStatusPill status={job.status} />
          </p>
        </div>
        <Link href={`/jobs/${job.id}`} className={buttonClass.secondary}>
          Back to schedule
        </Link>
      </header>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <h2 className="t-h3">No completed shifts to review</h2>
          <p className="text-ink-muted mt-1 text-[14px]">Only accepted shifts appear here once the job has started.</p>
          <Link href={`/jobs/${job.id}`} className={`${buttonClass.secondary} mt-5`}>
            Back to job
          </Link>
        </Card>
      ) : (
        <HoursSheet
          jobId={job.id}
          editable={editable}
          approved={job.status === "DONE" || job.status === "PAID"}
          overtimeAfterMinutes={overtimeAfterMinutes}
          rows={rows.map((r) => ({ ...r }))}
          flags={flags}
          lockedNote={
            job.status === "PLANNING" || job.status === "CREW_CONFIRMED"
              ? "Start the job before closing shifts."
              : job.status === "DONE" || job.status === "PAID"
                ? "Hours approved. Rows are locked; payouts use these numbers."
                : null
          }
        />
      )}
    </>
  );
}
