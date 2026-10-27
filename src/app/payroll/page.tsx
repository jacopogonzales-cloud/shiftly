import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, DemoTag, EmptyState, PageHeader, PayoutPill, RoleTag, Stat, Table, TableSkeleton } from "@/components/ui";
import { formatDateTime, formatEUR } from "@/lib/format";
import { getPayoutBatches } from "@/lib/queries";

export const metadata: Metadata = { title: "Payroll" };

const OPEN_STATES = new Set(["DRAFT", "PENDING", "PROCESSING"]);

export default function PayrollPage() {
  return (
    <>
      <PageHeader title="Payroll" />
      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[92px] rounded-card" />
              ))}
            </div>
            <TableSkeleton rows={6} cols={5} />
          </div>
        }
      >
        <Batches />
      </Suspense>
    </>
  );
}

async function Batches() {
  const batches = await getPayoutBatches();

  if (batches.length === 0) {
    return (
      <EmptyState
        title="No payouts yet"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="3" y="6" width="18" height="12" rx="2.5" />
            <circle cx="12" cy="12" r="2.75" />
          </svg>
        }
      >
        When a job&apos;s hours are signed off, Pay crew sends one PayPal batch for everyone on it. Batches and every item&apos;s status show up here.
      </EmptyState>
    );
  }

  const items = batches.flatMap((b) => b.items);
  const paidCents = items.filter((i) => i.status === "SUCCESS").reduce((n, i) => n + i.amountCents, 0);
  const paidPeople = new Set(items.filter((i) => i.status === "SUCCESS").map((i) => i.workerId)).size;
  const open = batches.filter((b) => OPEN_STATES.has(b.status)).length;
  const demoCents = batches.filter((b) => b.demo).flatMap((b) => b.items).filter((i) => i.status === "SUCCESS").reduce((n, i) => n + i.amountCents, 0);
  const failed = items.filter((i) => !["SUCCESS", "PENDING", "UNCLAIMED", "DRAFT"].includes(i.status)).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Paid out"
          value={formatEUR(paidCents)}
          hint={
            demoCents > 0
              ? `${paidPeople} ${paidPeople === 1 ? "person" : "people"} · ${formatEUR(demoCents)} is demo data`
              : `${paidPeople} ${paidPeople === 1 ? "person" : "people"} via PayPal`
          }
        />
        <Stat label="Open batches" value={open} hint={open === 0 ? "Nothing in flight" : "Waiting on PayPal"} />
        <Stat label="Failed items" value={failed} hint={failed === 0 ? "All clear" : "Retry from the batch"} />
      </div>

      {batches.map((batch) => (
        <Card key={batch.id}>
          <header className="border-line flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <p className="font-semibold">{batch.job.title}</p>
              <p className="text-text-3 mt-0.5 text-[13px]">
                {batch.job.client} · approved {batch.approvedAt ? formatDateTime(batch.approvedAt) : "—"} by {batch.createdBy}
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                <div className="flex gap-2">
                  <dt className="label self-center">Batch</dt>
                  <dd className="num">{batch.senderBatchId}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="label self-center">PayPal</dt>
                  <dd className="num text-info">{batch.paypalBatchId ?? "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {batch.demo && <DemoTag />}
                <PayoutPill status={batch.status} />
              </div>
              <p className="num text-[18px]">{formatEUR(batch.totalCents)}</p>
            </div>
          </header>
          <Table head={[{ label: "Worker" }, { label: "Role" }, { label: "Item" }, { label: "PayPal item" }, { label: "Amount", align: "right" }, { label: "Status" }]}>
            {batch.items.map((item) => (
              <tr key={item.id}>
                <td className="font-medium whitespace-nowrap">{item.worker.name}</td>
                <td>
                  <RoleTag role={item.worker.role} />
                </td>
                <td className="num text-text-2 text-[13px] whitespace-nowrap">{item.senderItemId}</td>
                <td className="num text-info text-[13px]">{item.paypalItemId ?? "—"}</td>
                <td className="num text-right whitespace-nowrap">{formatEUR(item.amountCents)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <PayoutPill status={item.status} />
                    {batch.demo && <DemoTag />}
                  </div>
                  {item.errorMessage && <p className="text-err mt-1 text-[13px]">{item.errorMessage}</p>}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </div>
  );
}
