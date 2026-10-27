import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, EmptyState, JobStatusPill, PageHeader, Table, TableSkeleton } from "@/components/ui";
import { formatDateRange, formatEUR } from "@/lib/format";
import { getJobs } from "@/lib/queries";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <>
      <PageHeader title="Jobs" />
      <Suspense fallback={<TableSkeleton rows={4} cols={6} />}>
        <JobsList />
      </Suspense>
    </>
  );
}

type Job = Awaited<ReturnType<typeof getJobs>>[number];

async function JobsList() {
  const jobs = await getJobs();

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs yet"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4M9 15h6" />
          </svg>
        }
      >
        A job starts from a plain-language brief. The agent turns it into shifts, picks a crew and pays everyone once the hours are signed off.
      </EmptyState>
    );
  }

  const active = jobs.filter((j) => j.status !== "PAID");
  const closed = jobs.filter((j) => j.status === "PAID");

  return (
    <div className="space-y-10">
      <JobGroup label="Active" jobs={active} empty="Nothing on the board. Every job is closed and paid." />
      <JobGroup label="Closed" jobs={closed} empty="No closed jobs yet." />
    </div>
  );
}

function JobGroup({ label, jobs, empty }: { label: string; jobs: Job[]; empty: string }) {
  return (
    <section>
      <h2 className="label mb-3">
        {label} <span className="text-text-2">· {jobs.length}</span>
      </h2>
      <Card>
        {jobs.length === 0 ? (
          <p className="text-text-2 px-5 py-6 text-[14px]">{empty}</p>
        ) : (
          <Table
            head={[{ label: "Job" }, { label: "Site" }, { label: "Dates" }, { label: "Crew", align: "right" }, { label: "Budget", align: "right" }, { label: "Status" }]}
          >
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </Table>
        )}
      </Card>
    </section>
  );
}

function JobRow({ job }: { job: Job }) {
  const needed = job.shifts.reduce((n, s) => n + s.headcount, 0);
  const confirmed = job.shifts.reduce((n, s) => n + s.assignments.filter((a) => a.status === "CONFIRMED").length, 0);
  return (
    <tr>
      <td>
        <p className="font-semibold">{job.title}</p>
        <p className="text-text-3 text-[13px]">{job.client}</p>
      </td>
      <td className="text-text-2 max-w-[260px]">{job.site}</td>
      <td className="whitespace-nowrap">
        <p className="num text-[13px]">{formatDateRange(job.startsAt, job.endsAt)}</p>
        <p className="text-text-3 text-[13px]">
          {job.shifts.length} {job.shifts.length === 1 ? "shift" : "shifts"}
        </p>
      </td>
      <td className="num text-right whitespace-nowrap">
        {confirmed}
        <span className="text-text-3">/{needed}</span>
      </td>
      <td className="num text-right whitespace-nowrap">{formatEUR(job.budgetCents)}</td>
      <td>
        <JobStatusPill status={job.status} />
      </td>
    </tr>
  );
}
