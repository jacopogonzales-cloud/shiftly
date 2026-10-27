import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Avatar,
  buttonClass,
  DemoTag,
  EmptyState,
  MetricStrip,
  MetricStripSkeleton,
  PageHeader,
  Pill,
  payoutBatchState,
  payoutItemState,
  PayoutItemPill,
  Skeleton,
  TableFootnote,
} from "@/components/ui";
import { formatDate, formatEUR, maskEmail } from "@/lib/format";
import { getPayoutBatches } from "@/lib/queries";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <>
      <PageHeader eyebrow="Money / Payouts" title="Payroll" subtitle="Every payout, from approval to arrival." />
      <Suspense fallback={<PayrollSkeleton />}>
        <Batches />
      </Suspense>
    </>
  );
}

type Batch = Awaited<ReturnType<typeof getPayoutBatches>>[number];

const sum = (items: { amountCents: number }[]) => items.reduce((n, i) => n + i.amountCents, 0);

async function Batches() {
  const batches = await getPayoutBatches();

  if (batches.length === 0) {
    return (
      <EmptyState
        title="No payout batches yet"
        action={
          <Link href="/jobs" className={buttonClass.secondary}>
            View jobs
          </Link>
        }
      >
        Pay completed jobs from a job page.
      </EmptyState>
    );
  }

  const items = batches.flatMap((b) => b.items);
  const paid = items.filter((i) => i.status === "SUCCESS");
  const processing = items.filter((i) => payoutItemState(i.status).severity === "info");
  const attention = items.filter((i) => ["warning", "error"].includes(payoutItemState(i.status).severity));
  const failedCount = attention.filter((i) => payoutItemState(i.status).severity === "error").length;
  const hasDemo = batches.some((b) => b.demo);

  return (
    <>
      <MetricStrip
        metrics={[
          { label: "Paid to crew", value: formatEUR(sum(paid)), money: true, caption: hasDemo ? "Credited in current + demo batches" : "Credited by PayPal" },
          {
            label: "Processing",
            value: formatEUR(sum(processing)),
            money: true,
            caption: processing.length === 0 ? "Nothing in flight" : `${processing.length} ${processing.length === 1 ? "payout is" : "payouts are"} still pending`,
          },
          {
            label: "Needs attention",
            value: formatEUR(sum(attention)),
            money: true,
            tone: attention.length > 0 ? "error" : undefined,
            caption:
              attention.length === 0 ? "All clear" : `${failedCount} failed · ${attention.length - failedCount} unclaimed or on hold`,
          },
        ]}
      />

      <div className="border-line bg-surface overflow-hidden rounded-[var(--radius-lg)] border">
        {batches.map((batch, i) => (
          <BatchRow key={batch.id} batch={batch} open={i === 0} />
        ))}
      </div>
      <TableFootnote left="PayPal Sandbox · Statuses reflect provider item states" right="All amounts in EUR" />
    </>
  );
}

function BatchRow({ batch, open }: { batch: Batch; open: boolean }) {
  const state = payoutBatchState(batch.items.map((i) => i.status));
  const paidItems = batch.items.filter((i) => i.status === "SUCCESS");
  const when = batch.approvedAt ?? batch.createdAt;

  return (
    <details open={open} className="group border-line border-b last:border-b-0">
      <summary className="hover:bg-surface-hover/50 flex min-h-[78px] cursor-pointer list-none items-center gap-4 px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="t-h3 text-[15px]">{batch.job.title}</h2>
            <Pill severity={state.severity} title={`PayPal batch status: ${batch.status}`}>
              {state.label}
            </Pill>
            {batch.demo && <DemoTag />}
          </div>
          <p className="t-number-xs text-ink-muted mt-1.5">
            {batch.senderBatchId} · {formatDate(when)} · {batch.items.length} {batch.items.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-ink-muted text-[12px]">
            {paidItems.length} / {batch.items.length} paid
          </p>
          <p className="whitespace-nowrap">
            <span className="t-number text-[14px] font-semibold">{formatEUR(sum(paidItems))}</span>
            {sum(paidItems) !== batch.totalCents && <span className="t-number-xs text-ink-muted"> / {formatEUR(batch.totalCents)}</span>}
          </p>
        </div>
        <ChevronDown size={18} aria-hidden="true" className="text-ink-muted shrink-0 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" />
      </summary>

      <div className="border-line overflow-x-auto border-t">
        <table className="w-full min-w-[820px] border-collapse text-left" aria-label={`Payout items for ${batch.job.title}`}>
          <thead>
            <tr className="border-line bg-surface-alt border-b">
              {["Recipient", "PayPal email", "Amount", "Status", "PayPal item"].map((h) => (
                <th key={h} scope="col" className={`text-ink-secondary h-11 px-6 text-[11px] font-extrabold tracking-[0.65px] uppercase ${h === "Amount" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-line [&>tr]:border-b [&>tr:last-child]:border-b-0 [&_td]:px-6">
            {batch.items.map((item) => (
              <tr key={item.id} className="h-[52px]">
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={item.worker.name} role={item.worker.role} />
                    <div>
                      <p className="t-body-strong text-[13px] leading-5">{item.worker.name}</p>
                      <p className="text-ink-muted text-[11px] leading-4">{roleLabel[item.worker.role]}</p>
                    </div>
                  </div>
                </td>
                <td className="text-ink-secondary text-[12px]">{maskEmail(item.worker.paypalEmail)}</td>
                <td className="t-number text-right">{formatEUR(item.amountCents)}</td>
                <td>
                  <PayoutItemPill status={item.status} />
                  {item.errorMessage && <p className="text-error-fg mt-1 text-[12px]">{item.errorMessage}</p>}
                </td>
                <td className="t-number-xs text-ink-secondary">{item.paypalItemId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {batch.demo && (
        <p className="border-line bg-surface-alt text-ink-muted border-t px-6 py-3 text-[12px]">
          Demo data: seeded history to show the layout. These IDs were never sent to PayPal.
        </p>
      )}
    </details>
  );
}

function PayrollSkeleton() {
  return (
    <div aria-busy="true">
      <MetricStripSkeleton count={3} />
      <div className="border-line bg-surface overflow-hidden rounded-[var(--radius-lg)] border">
        {[0, 1, 2].map((b) => (
          <div key={b} className="border-line border-b last:border-b-0">
            <div className="flex h-[78px] items-center gap-4 px-6">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-28" />
            </div>
            {b === 0 &&
              Array.from({ length: 6 }, (_, r) => (
                <div key={r} className="border-line flex h-[52px] items-center gap-6 border-t px-6">
                  <Skeleton className="size-[30px] rounded-full" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="ml-auto h-3 w-20" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading payroll…</span>
    </div>
  );
}
