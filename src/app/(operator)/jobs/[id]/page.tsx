import { ArrowUpRight, Building2, CalendarDays, CircleAlert, ClipboardCheck, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Avatar, Breadcrumb, buttonClass, Card, DemoTag, JobStatusPill, payoutBatchState, PayoutItemPill, Pill, Skeleton, type Severity } from "@/components/ui";
import type { ActivityLog } from "@/generated/prisma/client";
import { formatDateRange, formatDay, formatDelta, formatEUR, formatMinutes, formatTime, jobRef } from "@/lib/format";
import { jobInvitations } from "@/lib/invitations/invitations";
import { getJobDetail, type JobDetail } from "@/lib/job-detail";
import { statusSummary } from "@/lib/payouts/logic";
import { jobPayouts } from "@/lib/payouts/view";
import { roleLabel } from "@/lib/roles";
import { addDays, romeDateTime } from "@/lib/time";
import { CopyLinkButton, PlanButton, SendRequestsButton, StartJobButton } from "./agent-actions";
import { CrewSchedule, SchedulerSkeleton } from "./crew-schedule";
import { CheckStatusButton } from "../../payroll/payroll-actions";
import { PayCrew, PayoutWatcher } from "./pay-crew";

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
  const [invitations, payouts] = await Promise.all([jobInvitations(jobId), jobPayouts(jobId)]);

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
        <h1 className="t-h1">{job.title}</h1>
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
        <div className="min-w-0 space-y-6">
          {payouts.batches.length > 0 && <Payouts batches={payouts.batches} />}
          {invitations.some((i) => i.status !== "not-sent") && <Invitations invitations={invitations} />}
          <ShiftsAndHours detail={detail} />
        </div>
        <AgentPanel detail={detail} canPlan={canPlan} awaiting={invitations.filter((i) => i.status === "awaiting").length} payouts={payouts} />
      </div>
      {payouts.open && <PayoutWatcher jobId={job.id} />}
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
                        <Pill severity="warning">{formatDelta(diff)}</Pill>
                      ) : diff === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <span className="t-number">{formatDelta(diff)}</span>
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
  "invitation.accepted": "Invitation accepted",
  "invitation.declined": "Invitation declined",
  "hours.saved": "Hours saved",
  "crew.confirmed": "Crew confirmed",
  "job.started": "Job started",
  "hours.reconciled": "Hours reconciled",
  "hours.confirmed": "Hours approved",
  "payout.approved": "Payout approved",
  "payout.submitted": "Sent to PayPal",
  "payout.status": "PayPal update",
  "payout.rejected": "PayPal refused the payout",
  "payout.unverified": "Payout not confirmed yet",
  "payout.batch.success": "PayPal batch completed",
  "job.paid": "Job paid",
};

type Payouts = Awaited<ReturnType<typeof jobPayouts>>;

function AgentPanel({ detail, canPlan, awaiting, payouts }: { detail: JobDetail; canPlan: boolean; awaiting: number; payouts: Payouts }) {
  const { job } = detail;
  const entries = job.activity;

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
        <NextAction detail={detail} canPlan={canPlan} awaiting={awaiting} payouts={payouts} />
      </div>
    </aside>
  );
}

function Disabled({ label, note }: { label: string; note: string }) {
  return (
    <>
      <button type="button" disabled aria-disabled="true" className={`${buttonClass.primary} bg-neutral-bg text-neutral-fg h-12 w-full cursor-not-allowed hover:bg-[var(--neutral-bg)]`}>
        {label}
      </button>
      <p className="text-ink-muted text-center text-[12px]">{note}</p>
    </>
  );
}

/** The one next step for this job, in lifecycle order. */
function NextAction({ detail, canPlan, awaiting, payouts }: { detail: JobDetail; canPlan: boolean; awaiting: number; payouts: Payouts }) {
  const { job, summary } = detail;
  if (job.status === "PLANNING") {
    if (summary.proposed > 0 && summary.conflicts > 0) return <Disabled label="Send availability requests" note={`Resolve ${summary.conflicts} ${summary.conflicts === 1 ? "conflict" : "conflicts"} first.`} />;
    if (summary.proposed > 0) return <SendRequestsButton jobId={job.id} count={summary.proposed} />;
    if (canPlan) return <PlanButton jobId={job.id} wide label={summary.filled > 0 ? "Fill open slots" : "Plan with AI"} />;
    if (awaiting > 0) return <Disabled label="Waiting for answers" note={`${awaiting} ${awaiting === 1 ? "person hasn't" : "people haven't"} answered yet.`} />;
    return null;
  }
  if (job.status === "CREW_CONFIRMED") return <StartJobButton jobId={job.id} />;
  if (job.status === "IN_PROGRESS")
    return (
      <Link href={`/jobs/${job.id}/hours`} className={`${buttonClass.primary} h-12 w-full`}>
        <ClipboardCheck size={18} aria-hidden="true" /> Close shifts
      </Link>
    );
  if ((job.status === "DONE" || job.status === "PAID") && payouts.preview) {
    const { preview } = payouts;
    return (
      <PayCrew
        payable={job.status === "DONE" && !preview.blocker && preview.plan.kind === "create"}
        jobId={job.id}
        subtitle={`${job.title} · ${jobRef(job.id)}`}
        recipients={preview.recipients}
        totalCents={preview.totalCents}
        minutes={preview.minutes}
        skipped={preview.skipped}
        batches={payouts.batches}
      >
        <PayoutNext status={job.status} payouts={payouts} jobId={job.id} />
      </PayCrew>
    );
  }
  return null;
}

/** Done/Paid when nothing new can be paid: say what PayPal is doing and what's left. */
function PayoutNext({ status, payouts, jobId }: { status: string; payouts: Payouts; jobId: number }) {
  const live = payouts.batches.filter((b) => !b.demo);
  const latestItems = new Map<number, string>();
  for (const b of [...live].reverse()) for (const i of b.items) latestItems.set(i.workerId, i.status);
  const states = [...latestItems.values()];
  const failed = states.filter((s) => s === "FAILED").length;
  const unclaimed = states.filter((s) => s === "UNCLAIMED").length;
  const payroll = (
    <Link href="/payroll" className={`${buttonClass.quiet} w-full`}>
      View in Payroll <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );

  if (payouts.open)
    return (
      <>
        <p className="text-[13px] font-bold">Payout in progress</p>
        <p className="text-ink-muted text-[12px]">
          {payouts.open.senderBatchId}: {statusSummary(payouts.open.items.map((i) => i.status))}. Checking PayPal every 20 seconds.
        </p>
        <CheckStatusButton jobId={jobId} wide />
        {payroll}
      </>
    );
  if (status === "PAID")
    return (
      <>
        <p className="text-success-fg text-[13px] font-bold">Everyone is paid.</p>
        {payroll}
      </>
    );
  if (failed > 0 || unclaimed > 0)
    return (
      <>
        <p className="text-[13px] font-bold">{statusSummary(states)}</p>
        <p className="text-ink-muted text-[12px]">
          {unclaimed > 0 && `Unclaimed money waits for the recipient to claim it on PayPal; it is never sent twice. `}
          {failed > 0 && `Failed payouts can be retried from Payroll.`}
        </p>
        {live[0] && <CheckStatusButton batchId={live[0].id} wide />}
        {failed > 0 ? (
          <Link href="/payroll" className={`${buttonClass.primary} h-12 w-full`}>
            Retry failed in Payroll
          </Link>
        ) : (
          payroll
        )}
      </>
    );
  return <Disabled label="Review payouts" note={payouts.preview?.blocker ?? "Nothing to pay."} />;
}

/** Every payout attempt for this job, newest first; item pills show PayPal's raw status on hover. */
function Payouts({ batches }: { batches: Payouts["batches"] }) {
  return (
    <Card>
      <div className="border-line flex items-center justify-between gap-4 border-b px-6 py-[18px]">
        <div>
          <h2 className="t-h3">Payouts</h2>
          <p className="text-ink-muted t-small font-medium">PayPal Sandbox. Paid shows only once PayPal confirms the transfer.</p>
        </div>
        <Link href="/payroll" className="text-ink-secondary hover:text-ink inline-flex h-10 items-center gap-1 text-[12px] font-bold">
          Payroll <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {batches.map((b) => {
        const state = payoutBatchState(b.items.map((i) => i.status));
        return (
          <section key={b.id} className="border-line border-b last:border-b-0">
            <div className="bg-surface-alt flex flex-wrap items-center gap-2.5 px-6 py-3">
              <span className="t-number-xs font-semibold">{b.senderBatchId}</span>
              <Pill severity={state.severity} title={`PayPal batch status: ${b.status}`}>
                {state.label}
              </Pill>
              {b.demo && <DemoTag />}
              <span className="t-number-xs text-ink-muted ml-auto">{b.paypalBatchId ? `PayPal ${b.paypalBatchId}` : "Not at PayPal"}</span>
            </div>
            {b.errorMessage && <p className="text-error-fg px-6 pt-3 text-[12px] font-semibold">{b.errorMessage}</p>}
            <ul>
              {b.items.map((i) => (
                <li key={i.id} className="border-line flex min-h-[48px] items-center gap-3 border-t px-6 py-1.5 first:border-t-0">
                  <span className="min-w-0 flex-1 text-[13px] font-bold">{i.name}</span>
                  <PayoutItemPill status={i.status} />
                  <span className="t-number w-[96px] text-right">{formatEUR(i.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Card>
  );
}

const INVITE_STATE: Record<string, { severity: Severity; label: string }> = {
  "not-sent": { severity: "neutral", label: "Not sent" },
  awaiting: { severity: "info", label: "Awaiting response" },
  accepted: { severity: "success", label: "Accepted" },
  declined: { severity: "error", label: "Declined" },
  inactive: { severity: "neutral", label: "Withdrawn" },
};

function Invitations({ invitations }: { invitations: Awaited<ReturnType<typeof jobInvitations>> }) {
  const order = { awaiting: 0, declined: 1, "not-sent": 2, accepted: 3, inactive: 4 };
  const rows = [...invitations].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const answered = invitations.filter((i) => i.status === "accepted" || i.status === "declined").length;
  const sent = invitations.filter((i) => i.status !== "not-sent").length;
  return (
    <Card>
      <div className="border-line flex items-center justify-between gap-4 border-b px-6 py-[18px]">
        <div>
          <h2 className="t-h3">Invitations</h2>
          <p className="text-ink-muted t-small font-medium">Requests aren&apos;t emailed in the sandbox. Open a link to answer as that person.</p>
        </div>
        <p className="text-ink-muted t-small font-medium whitespace-nowrap">
          {answered} of {sent} answered
        </p>
      </div>
      <ul>
        {rows.map((i) => {
          const st = INVITE_STATE[i.status];
          return (
            <li key={i.workerId} className="border-line flex min-h-[58px] items-center gap-3 border-b px-6 py-2 last:border-b-0">
              <Avatar name={i.name} role={i.role} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{i.name}</p>
                <p className="text-ink-muted text-[11px]">
                  {roleLabel[i.role]} · {i.shifts} {i.shifts === 1 ? "shift" : "shifts"}
                  {i.pending > 0 && i.status !== "not-sent" ? ` · ${i.pending} new, not sent` : ""}
                  {i.declineReason ? ` · ${i.declineReason}` : ""}
                </p>
              </div>
              <Pill severity={st.severity}>{st.label}</Pill>
              {i.link ? (
                <div className="flex items-center">
                  <a
                    href={i.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-secondary hover:bg-surface-hover hover:text-ink inline-flex h-10 items-center gap-1 rounded-[10px] px-2.5 text-[12px] font-bold"
                  >
                    Open link <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <CopyLinkButton path={i.link} />
                </div>
              ) : (
                <span className="w-[134px]" />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AgentEntry({ entry, latest }: { entry: ActivityLog; latest: boolean }) {
  const title = ENTRY_TITLE[entry.type] ?? "Update";
  const actor: Record<string, ReactNode> = { agent: "Agent", operator: "You", paypal: "PayPal", crew: "Crew" };
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
