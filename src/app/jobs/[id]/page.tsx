import { CalendarDays, CircleAlert, MapPin, Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Breadcrumb, buttonClass, Card, JobStatusPill, Pill, Skeleton } from "@/components/ui";
import type { ActivityLog } from "@/generated/prisma/client";
import { formatDateRange, formatDay, formatEUR, formatMinutes, formatTime, jobRef } from "@/lib/format";
import { getJobDetail, type JobDetail } from "@/lib/job-detail";
import { roleLabel } from "@/lib/roles";
import { addDays, romeDateTime } from "@/lib/time";
import { PlanButton } from "./agent-actions";
import { CrewSchedule, SchedulerSkeleton } from "./crew-schedule";

export const metadata: Metadata = { title: "Job" };

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<JobSkeleton />}>
      <JobView params={params} />
    </Suspense>
  );
}

async function JobView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) notFound();
  const detail = await getJobDetail(jobId);
  if (!detail) notFound();

  const { job, summary } = detail;
  const canPlan = job.status === "PLANNING" && summary.open > 0;

  // Timeline: first day 06:00 → last day 23:00, nights tinted.
  const firstDay = detail.days[0];
  const lastDay = detail.days.at(-1)!;
  const nights = detail.days.slice(0, -1).map((d) => ({ startDate: romeDateTime(d, "21:00").toISOString(), endDate: romeDateTime(addDays(d, 1), "06:00").toISOString() }));

  return (
    <>
      <Breadcrumb items={[{ label: "Jobs", href: "/jobs" }, { label: jobRef(job.id) }]} />

      <header className="mt-3 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="t-h1">{job.title}</h1>
          {canPlan && <PlanButton jobId={job.id} />}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="text-ink-secondary flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={15} aria-hidden="true" /> {formatDateRange(job.startsAt, job.endsAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={15} aria-hidden="true" /> {job.site}
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 size={15} aria-hidden="true" /> {job.client}
            </span>
            <JobStatusPill status={job.status} />
          </div>
          <dl className="flex">
            <Money label="Budget" cents={job.budgetCents} />
            <Money label="Planned" cents={summary.plannedCents} warn={job.budgetCents > 0 && summary.plannedCents > job.budgetCents} />
            {summary.paidCents > 0 && <Money label="Paid" cents={summary.paidCents} />}
          </dl>
        </div>
      </header>

      {summary.conflicts > 0 && (
        <div role="alert" className="border-error-line bg-error-bg text-error-fg mb-4 flex items-center gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-[13px] font-bold">
          <CircleAlert size={18} aria-hidden="true" />
          {summary.conflicts} {summary.conflicts === 1 ? "conflict needs" : "conflicts need"} a decision. Hover a red shift to see why.
        </div>
      )}

      {detail.events.length === 0 ? (
        <Card className="mb-8 flex flex-col items-center px-6 py-14 text-center">
          <h2 className="t-h3">No shifts planned</h2>
          <p className="text-ink-muted mt-1 max-w-md text-[14px]">
            {summary.slots} crew {summary.slots === 1 ? "slot" : "slots"} across {job.shifts.length} shift {job.shifts.length === 1 ? "line" : "lines"}. The agent proposes people; nobody is contacted until you send requests.
          </p>
          {canPlan && (
            <div className="mt-5">
              <PlanButton jobId={job.id} label="Generate plan" />
            </div>
          )}
        </Card>
      ) : (
        <CrewSchedule
          resources={detail.resources}
          events={detail.events}
          validation={detail.validation}
          days={detail.days.map((d) => ({ key: d, label: formatDay(romeDateTime(d, "12:00")), iso: romeDateTime(d, "06:00").toISOString() }))}
          startDate={romeDateTime(firstDay, "06:00").toISOString()}
          endDate={romeDateTime(lastDay, "23:00").toISOString()}
          nights={nights}
          editable={detail.editable}
          caption={[
            `${summary.people} ${summary.people === 1 ? "person" : "people"}`,
            `${summary.filled} ${summary.filled === 1 ? "assignment" : "assignments"}`,
            summary.open > 0 ? `${summary.open} open ${summary.open === 1 ? "slot" : "slots"}` : "all slots filled",
          ].join(" · ")}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] wide:grid-cols-[minmax(0,1fr)_320px]">
        <ShiftsAndHours detail={detail} />
        <AgentPanel detail={detail} canPlan={canPlan} />
      </div>
    </>
  );
}

function Money({ label, cents, warn }: { label: string; cents: number; warn?: boolean }) {
  return (
    <div className="border-line min-w-[120px] border-l pl-4 first:border-l-0 first:pl-0 [&+&]:ml-4">
      <dt className="text-ink-muted text-[11px] font-semibold">{label}</dt>
      <dd className={`t-number mt-1 text-[15px] font-semibold ${warn ? "text-error-fg" : ""}`}>{formatEUR(cents)}</dd>
    </div>
  );
}

function ShiftsAndHours({ detail }: { detail: JobDetail }) {
  const { people, job } = detail;
  const anyActual = people.some((p) => p.actual !== null && job.status !== "PLANNING");
  return (
    <Card>
      <div className="border-line flex items-center justify-between gap-4 border-b px-6 py-[18px]">
        <div>
          <h2 className="t-h3">Shifts &amp; hours</h2>
          <p className="text-ink-muted t-small font-medium">Planned paid time excludes unpaid breaks. Approved hours decide the payout.</p>
        </div>
      </div>
      {people.length === 0 ? (
        <p className="text-ink-muted px-6 py-8 text-[14px]">No one assigned yet. Plan the crew to see hours and cost per person.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left" aria-label="Hours per person">
            <thead>
              <tr className="border-line bg-surface-alt border-b">
                {["Person", "Planned", "Actual", "Difference", "Pay"].map((h) => (
                  <th key={h} scope="col" className={`text-ink-secondary h-11 px-5 text-[11px] font-extrabold tracking-[0.65px] uppercase ${h === "Pay" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const diff = p.actual === null ? null : p.actual - p.planned;
                return (
                  <tr key={p.workerId} className="border-line h-[52px] border-b last:border-b-0">
                    <td className="px-5">
                      <p className="text-[13px] font-bold">{p.name}</p>
                      <p className="text-ink-muted text-[11px]">{roleLabel[p.role]}</p>
                    </td>
                    <td className="t-number px-5">{formatMinutes(p.planned)}</td>
                    <td className="t-number px-5">{anyActual && p.actual !== null ? formatMinutes(p.actual) : "—"}</td>
                    <td className="px-5">
                      {diff === null || !anyActual ? (
                        <span className="text-ink-muted">—</span>
                      ) : Math.abs(diff) > 15 ? (
                        <Pill severity="warning">{`${diff > 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`}</Pill>
                      ) : diff === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <span className="t-number">{`${diff > 0 ? "+" : "−"}${Math.abs(diff)}m`}</span>
                      )}
                    </td>
                    <td className="t-number px-5 text-right">{formatEUR(anyActual && p.actualCents !== null ? p.actualCents : p.plannedCents)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-line border-t">
                <td colSpan={4} className="px-5 py-4 text-[13px] font-bold">
                  {anyActual ? "Total at actual hours" : "Planned total"}
                </td>
                <td className="t-number px-5 py-4 text-right text-[15px] font-semibold">
                  {formatEUR(people.reduce((n, p) => n + (anyActual && p.actualCents !== null ? p.actualCents : p.plannedCents), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

const ENTRY_TITLE: Record<string, string> = {
  "requirements.extracted": "Brief read",
  "job.created": "Job created",
  "plan.proposed": "Draft plan created",
  "plan.rebalanced": "Crew rebalanced",
  "assignment.moved": "Shift reassigned",
  "requests.sent": "Invitations sent",
  "crew.confirmed": "Crew confirmed",
  "job.started": "Job started",
  "hours.reconciled": "Hours reconciled",
  "hours.confirmed": "Hours approved",
  "payout.approved": "Payout approved",
  "payout.batch.success": "PayPal batch completed",
  "job.paid": "Job paid",
};

function AgentPanel({ detail, canPlan }: { detail: JobDetail; canPlan: boolean }) {
  const { job, summary } = detail;
  const entries = job.activity;
  const sendBlocked = summary.conflicts > 0 ? `Resolve ${summary.conflicts} ${summary.conflicts === 1 ? "conflict" : "conflicts"} first.` : summary.proposed === 0 ? "Nothing proposed to send." : "Invitations are not switched on yet.";

  return (
    <aside aria-label="Agent" className="border-line bg-surface rounded-[var(--radius-lg)] border border-l-2 px-5 py-5 lg:sticky lg:top-6">
      <div className="flex items-center gap-2">
        <span className="bg-accent size-1.5 rounded-full" aria-hidden="true" />
        <h2 className="t-h3">Agent</h2>
      </div>
      <p className="text-ink-muted text-[12px]">Every action has a reason. You stay in control.</p>

      {entries.length === 0 ? (
        <p className="text-ink-muted mt-5 text-[13px]">No actions yet. Plan the crew to get a first proposal.</p>
      ) : (
        <ol className="relative mt-5 max-h-[560px] space-y-5 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <AgentEntry key={e.id} entry={e} latest={i === 0} />
          ))}
        </ol>
      )}

      <div className="border-line mt-5 space-y-2 border-t pt-5">
        {canPlan ? (
          <PlanButton jobId={job.id} wide label={summary.filled > 0 ? "Fill open slots" : "Plan with AI"} />
        ) : job.status === "PLANNING" ? (
          <>
            <button type="button" disabled aria-disabled="true" className={`${buttonClass.primary} bg-neutral-bg text-neutral-fg h-12 w-full cursor-not-allowed hover:bg-[var(--neutral-bg)]`}>
              Send availability requests
            </button>
            <p className="text-ink-muted text-center text-[12px]">{sendBlocked}</p>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function AgentEntry({ entry, latest }: { entry: ActivityLog; latest: boolean }) {
  const title = ENTRY_TITLE[entry.type] ?? entry.type;
  const actor: Record<string, ReactNode> = { agent: "Agent", operator: "You", paypal: "PayPal" };
  const data = (entry.data ?? {}) as { agentAvailable?: boolean; seed?: boolean };
  return (
    <li className="relative pl-6">
      <span
        className={`absolute top-1 left-0 size-3 rounded-full border-2 ${latest ? "border-accent bg-surface" : "border-line-strong bg-surface"}`}
        aria-hidden="true"
      />
      <p className="t-number-xs text-ink-muted">
        {formatDay(entry.createdAt)} · {formatTime(entry.createdAt)} · {actor[entry.actor]}
      </p>
      <p className="mt-0.5 text-[13px] font-extrabold">{title}</p>
      <p className="text-ink-secondary mt-0.5 text-[12px] leading-[18px]">{entry.message}</p>
      {data.agentAvailable === false && <p className="text-warning-fg mt-1 text-[11px] font-bold">Agent offline: ranked by rules only.</p>}
      {data.seed && <p className="text-ink-muted mt-1 text-[11px]">Demo data</p>}
    </li>
  );
}

function JobSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mt-6 h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-80" />
      <Skeleton className="mt-4 mb-8 h-4 w-[420px]" />
      <SchedulerSkeleton rows={6} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[320px] rounded-[var(--radius-lg)]" />
        <Skeleton className="h-[320px] rounded-[var(--radius-lg)]" />
      </div>
      <span className="sr-only">Loading job…</span>
    </div>
  );
}
