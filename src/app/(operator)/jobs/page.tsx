import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, EmptyState, MetricStrip, MetricStripSkeleton, PageHeader, TableSkeleton } from "@/components/ui";
import { formatDateRange, formatEUR, jobRef } from "@/lib/format";
import { getJobs } from "@/lib/queries";
import { JobsTable, type JobRow } from "./jobs-table";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations / Overview"
        title="Jobs"
        subtitle="Plan the work. Keep the crew moving."
        actions={
          <Link href="/jobs/new" className={buttonClass.primary}>
            <Plus size={18} aria-hidden="true" /> New job
          </Link>
        }
      />
      <Suspense
        fallback={
          <>
            <MetricStripSkeleton count={4} />
            <div className="mb-5 h-[42px]" />
            <TableSkeleton rows={5} rowHeight={76} columns={["26%", "11%", "15%", "6%", "11%", "17%"]} />
          </>
        }
      >
        <JobsOverview />
      </Suspense>
    </>
  );
}

async function JobsOverview() {
  const jobs = await getJobs();

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="Your first job starts here"
        action={
          <Link href="/jobs/new" className={buttonClass.primary}>
            Create a job
          </Link>
        }
      >
        Describe the work and Shiftly will propose a crew plan.
      </EmptyState>
    );
  }

  const toPay = jobs.filter((j) => j.status === "DONE").length;
  const withDeclines = jobs.filter((j) => j.declined > 0 && j.status === "PLANNING").length;
  const attention = toPay + withDeclines;
  const assignments = jobs.reduce((n, j) => n + j.assigned, 0);
  const staffed = jobs.filter((j) => j.assigned > 0).length;
  const readyToPayCents = jobs.filter((j) => j.status === "DONE").reduce((n, j) => n + j.forecastCents, 0);

  const rows: JobRow[] = jobs.map((j) => ({
    id: j.id,
    ref: jobRef(j.id),
    title: j.title,
    client: j.client,
    site: j.site,
    dates: formatDateRange(j.startsAt, j.endsAt),
    startsAt: j.startsAt.getTime(),
    status: j.status,
    confirmed: j.confirmed,
    proposed: j.proposed,
    requested: j.sent,
    needed: j.needed,
    budget: formatEUR(j.budgetCents),
    forecast: formatEUR(j.forecastCents),
    forecastRatio: j.budgetCents > 0 ? j.forecastCents / j.budgetCents : 0,
    forecastLabel: j.status === "PAID" ? "final" : "planned",
  }));

  return (
    <>
      <MetricStrip
        metrics={[
          { label: "Active & recent jobs", value: String(jobs.length), caption: "Across your workspace" },
          {
            label: "Need your attention",
            value: String(attention),
            caption: attention === 0 ? "Nothing waiting on you" : [toPay && `${toPay} to pay`, withDeclines && `${withDeclines} with declines`].filter(Boolean).join(" · "),
          },
          { label: "Crew assignments", value: String(assignments), caption: `Booked across ${staffed} ${staffed === 1 ? "job" : "jobs"}` },
          { label: "Ready to pay", value: formatEUR(readyToPayCents), money: true, caption: toPay === 0 ? "No jobs waiting for payout" : `Planned cost of ${toPay} ${toPay === 1 ? "job" : "jobs"}` },
        ]}
      />
      <JobsTable rows={rows} />
    </>
  );
}
