import "server-only";
import type { Actor, Role } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { formatEUR } from "@/lib/format";
import { payLines } from "@/lib/pay";
import { createPayout, getPayout, PayPalError, paypalConfigured, type PayoutsBatch } from "@/lib/paypal/client";
import { romeDayKey } from "@/lib/time";
import { isBatchOpen, isJobPaid, mergeSnapshot, planPayout, retryLines, statusSummary, type BatchFacts, type Snapshot } from "./logic";

// Money moves only from approvePayout / retryFailed, which the UI calls after the operator confirms the total.
// Everything else here only reads PayPal and records what it says.

export const UNVERIFIED = "We couldn't verify the payout response. Don't send again yet.";

export type Recipient = { workerId: number; name: string; role: Role; email: string; minutes: number; overtimeMinutes: number; amountCents: number };

type Tx = Prisma.TransactionClient;
type Client = Pick<Tx, "job" | "settings" | "payoutBatch">;

/** Approved pay per person (confirmed shifts with saved actual minutes) and the job's payout history. */
async function loadPayable(client: Client, jobId: number) {
  const [job, settings] = await Promise.all([
    client.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
        shifts: {
          select: {
            startsAt: true,
            assignments: {
              where: { status: "CONFIRMED" },
              select: { actualMinutes: true, worker: { select: { id: true, name: true, role: true, paypalEmail: true, hourlyRateCents: true } } },
            },
          },
        },
        payoutBatches: { orderBy: { id: "asc" }, select: { id: true, senderBatchId: true, status: true, demo: true, items: { select: { workerId: true, status: true } } } },
      },
    }),
    client.settings.findUnique({ where: { id: 1 }, select: { companyName: true, overtimeAfterMinutes: true, overtimeMultiplier: true } }),
  ]);
  if (!job) return null;
  const rules = { overtimeAfterMinutes: settings?.overtimeAfterMinutes ?? 480, overtimeMultiplier: settings?.overtimeMultiplier ?? 1.25 };
  const assignments = job.shifts.flatMap((s) => s.assignments.map((a) => ({ ...a, day: romeDayKey(s.startsAt) })));
  const workers = new Map(assignments.map((a) => [a.worker.id, a.worker]));
  const lines = payLines(
    assignments.filter((a) => a.actualMinutes !== null).map((a) => ({ workerId: a.worker.id, day: a.day, minutes: a.actualMinutes!, hourlyRateCents: a.worker.hourlyRateCents })),
    rules,
  );
  const recipients: Recipient[] = lines
    .map((l) => {
      const w = workers.get(l.workerId)!;
      return { workerId: l.workerId, name: w.name, role: w.role, email: w.paypalEmail, minutes: l.minutes, overtimeMinutes: l.overtimeMinutes, amountCents: l.amountCents };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    job,
    companyName: settings?.companyName ?? "Shiftly",
    recipients,
    hoursMissing: assignments.some((a) => a.actualMinutes === null),
    batches: job.payoutBatches as BatchFacts[],
  };
}

/** What the Pay crew dialog shows: only the people this click would pay, and why it can't go ahead if it can't. */
export async function payPreview(jobId: number) {
  const data = await loadPayable(db(), jobId);
  if (!data) return null;
  const plan = planPayout({ jobId, lines: data.recipients, batches: data.batches });
  const included = plan.kind === "create" ? new Set(plan.items.map((i) => i.workerId)) : new Set<number>();
  const recipients = data.recipients.filter((r) => included.has(r.workerId));
  let blocker: string | null = null;
  if (!paypalConfigured()) blocker = "Connect PayPal Sandbox to send payouts.";
  else if (data.job.status !== "DONE") blocker = "Approve hours before paying.";
  else if (data.hoursMissing) blocker = "Approve hours before paying.";
  else if (plan.kind === "nothing") blocker = plan.reason;
  return {
    plan,
    recipients,
    totalCents: recipients.reduce((n, r) => n + r.amountCents, 0),
    minutes: recipients.reduce((n, r) => n + r.minutes, 0),
    skipped: plan.kind === "create" ? plan.skipped.length : 0,
    blocker,
  };
}

export type PayResult = { ok: true; batchId: number; reused: boolean; message: string } | { ok: false; batchId?: number; unverified?: boolean; message: string };

/** "Confirm and pay": the operator saw `expectedTotalCents`; anything else is refused. */
export async function approvePayout(jobId: number, expectedTotalCents: number): Promise<PayResult> {
  const data = await loadPayable(db(), jobId);
  if (!data) return { ok: false, message: "Job not found." };
  if (!paypalConfigured()) return { ok: false, message: "Connect PayPal Sandbox to send payouts." };
  if (data.job.status !== "DONE" || data.hoursMissing) return { ok: false, message: "Approve hours before paying." };

  const plan = planPayout({ jobId, lines: data.recipients, batches: data.batches });
  if (plan.kind === "reuse") return reuse(plan.batchId);
  if (plan.kind === "nothing") return { ok: false, message: plan.reason };
  if (plan.totalCents !== expectedTotalCents) return { ok: false, message: "Amounts changed since you opened this. Review the payout again." };

  const created = await createBatch(jobId, plan, null, `Approved ${formatEUR(plan.totalCents)} for ${plan.items.length} ${plan.items.length === 1 ? "person" : "people"}. Batch ${plan.senderBatchId}.`);
  return created.reused ? reuse(created.batchId) : submitBatch(created.batchId);
}

/** "Retry failed": a new batch for the FAILED items of one batch only, after re-checking them with PayPal. */
export async function retryFailed(batchId: number, expectedTotalCents: number): Promise<PayResult> {
  const original = await db().payoutBatch.findUnique({ where: { id: batchId }, select: { id: true, jobId: true, demo: true, senderBatchId: true } });
  if (!original || original.demo) return { ok: false, message: "This batch can't be retried." };
  await refreshBatch(batchId, "paypal"); // provider check first: only items PayPal still calls FAILED

  const batch = await db().payoutBatch.findUniqueOrThrow({ where: { id: batchId }, select: { items: { select: { workerId: true, status: true, amountCents: true } } } });
  const job = await db().payoutBatch.findMany({ where: { jobId: original.jobId }, select: { id: true, senderBatchId: true, status: true, demo: true, items: { select: { workerId: true, status: true } } } });
  const plan = planPayout({ jobId: original.jobId, lines: retryLines(batch), batches: job });
  if (plan.kind === "reuse") return reuse(plan.batchId);
  if (plan.kind === "nothing") return { ok: false, message: "No failed payouts left to retry." };
  if (plan.totalCents !== expectedTotalCents) return { ok: false, message: "PayPal's status changed. Review the retry again." };

  const created = await createBatch(original.jobId, plan, original.id, `Retry approved: ${formatEUR(plan.totalCents)} for ${plan.items.length} failed ${plan.items.length === 1 ? "payout" : "payouts"} from ${original.senderBatchId}. Batch ${plan.senderBatchId}.`);
  return created.reused ? reuse(created.batchId) : submitBatch(created.batchId);
}

async function reuse(batchId: number): Promise<PayResult> {
  const batch = await db().payoutBatch.findUniqueOrThrow({ where: { id: batchId }, select: { senderBatchId: true, paypalBatchId: true } });
  // A batch whose answer was never confirmed is sent again with the same PayPal-Request-Id: PayPal returns the original.
  const res = batch.paypalBatchId ? await refreshBatch(batchId, "paypal") : await submitBatch(batchId);
  if (!res.ok) return res;
  return { ok: true, batchId, reused: true, message: `Batch ${batch.senderBatchId} is already on its way. No second payout was created.` };
}

async function createBatch(
  jobId: number,
  plan: Extract<ReturnType<typeof planPayout>, { kind: "create" }>,
  retryOfId: number | null,
  message: string,
): Promise<{ batchId: number; reused: boolean }> {
  try {
    const batch = await db().$transaction(async (tx) => {
      const b = await tx.payoutBatch.create({
        data: {
          jobId,
          senderBatchId: plan.senderBatchId,
          status: "DRAFT",
          totalCents: plan.totalCents,
          createdBy: "operator",
          approvedAt: new Date(),
          retryOfId,
          items: { create: plan.items.map((i) => ({ workerId: i.workerId, amountCents: i.amountCents, senderItemId: i.senderItemId })) },
        },
      });
      await logActivity(tx, { jobId, actor: "operator", type: "payout.approved", message, data: { batchId: b.id, senderBatchId: plan.senderBatchId, totalCents: plan.totalCents } });
      return b;
    });
    return { batchId: batch.id, reused: false };
  } catch (err) {
    // Two clicks at once: the second insert hits the unique senderBatchId. Use the batch the first one made.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db().payoutBatch.findUnique({ where: { senderBatchId: plan.senderBatchId }, select: { id: true } });
      if (existing) return { batchId: existing.id, reused: true };
    }
    throw err;
  }
}

/** Sends a DRAFT batch. Safe to call again: same PayPal-Request-Id, same sender ids. */
async function submitBatch(batchId: number): Promise<PayResult> {
  const batch = await db().payoutBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { job: { select: { id: true, title: true } }, items: { include: { worker: { select: { paypalEmail: true } } } } },
  });
  if (batch.paypalBatchId) return refreshBatch(batchId, "paypal");
  if (batch.status !== "DRAFT") return { ok: false, batchId, message: batch.errorMessage ?? "This batch was not sent." };
  const settings = await db().settings.findUnique({ where: { id: 1 }, select: { companyName: true } });
  const company = settings?.companyName ?? "Shiftly";

  let created: PayoutsBatch;
  try {
    created = await createPayout({
      senderBatchId: batch.senderBatchId,
      emailSubject: `You have a payment from ${company}`,
      emailMessage: `Pay for ${batch.job.title}. Thanks for your work.`,
      items: batch.items.map((i) => ({ senderItemId: i.senderItemId, receiver: i.worker.paypalEmail, amountCents: i.amountCents, note: `${company} · ${batch.job.title}` })),
    });
  } catch (err) {
    const duplicate = err instanceof PayPalError && /duplicate|already/i.test(`${err.code} ${err.message}`);
    if (err instanceof PayPalError && err.refused && !duplicate) {
      await db().$transaction(async (tx) => {
        await tx.payoutBatch.update({ where: { id: batchId }, data: { status: "REJECTED", errorMessage: err.message } });
        await tx.payoutItem.updateMany({ where: { batchId, status: "DRAFT" }, data: { status: "REJECTED" } });
        await logActivity(tx, {
          jobId: batch.jobId,
          actor: "paypal",
          type: "payout.rejected",
          message: `PayPal refused batch ${batch.senderBatchId}: ${err.message}. No money moved.`,
          data: { batchId, code: err.code, debugId: err.debugId },
        });
      });
      return { ok: false, batchId, message: `PayPal refused the payout: ${err.message}. No money moved.` };
    }
    // Unknown outcome: keep the DRAFT so the next check re-sends it idempotently instead of creating a new one.
    console.error("submitBatch", batch.senderBatchId, err instanceof Error ? err.message : err);
    await db().$transaction(async (tx) => {
      await tx.payoutBatch.update({ where: { id: batchId }, data: { errorMessage: UNVERIFIED } });
      await logActivity(tx, { jobId: batch.jobId, actor: "agent", type: "payout.unverified", message: `${UNVERIFIED} Batch ${batch.senderBatchId} will be checked again.`, data: { batchId } });
    });
    return { ok: false, batchId, unverified: true, message: UNVERIFIED };
  }

  await applyBatchStatus(batchId, toSnapshot(created), "paypal");
  // The create answer has no items yet; fetch them now so the dialog shows real item states.
  return refreshBatch(batchId, "paypal").then((r) => (r.ok ? { ...r, message: `Sent to PayPal as ${batch.senderBatchId}.` } : r));
}

/** Re-reads one batch from PayPal (or re-sends it if PayPal's answer was never confirmed). */
export async function refreshBatch(batchId: number, actor: Actor): Promise<PayResult> {
  const batch = await db().payoutBatch.findUnique({ where: { id: batchId }, select: { id: true, demo: true, status: true, paypalBatchId: true, errorMessage: true } });
  if (!batch || batch.demo) return { ok: false, message: "Nothing to check for this batch." };
  if (!batch.paypalBatchId) return batch.status === "DRAFT" ? submitBatch(batchId) : { ok: false, batchId, message: batch.errorMessage ?? "This batch was not sent." };
  try {
    await applyBatchStatus(batchId, toSnapshot(await getPayout(batch.paypalBatchId)), actor);
    return { ok: true, batchId, reused: false, message: "Status updated from PayPal." };
  } catch (err) {
    console.error("refreshBatch", batchId, err instanceof Error ? err.message : err);
    return { ok: false, batchId, message: "Couldn't reach PayPal. The status will be checked again." };
  }
}

function toSnapshot(b: PayoutsBatch): Snapshot {
  return {
    paypalBatchId: b.batch_header.payout_batch_id,
    batchStatus: b.batch_header.batch_status,
    items: (b.items ?? []).map((i) => ({
      senderItemId: i.payout_item.sender_item_id,
      paypalItemId: i.payout_item_id,
      transactionId: i.transaction_id ?? null,
      status: i.transaction_status,
      error: i.errors?.message ?? i.errors?.name ?? null,
    })),
  };
}

/**
 * The one place PayPal's view lands in our rows; webhook and reconcile both end here.
 * Idempotent: the batch row is locked, the merge only moves statuses forward, and nothing is logged when nothing changed.
 */
export async function applyBatchStatus(batchId: number, snap: Snapshot, actor: Actor): Promise<void> {
  await db().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PayoutBatch" WHERE id = ${batchId} FOR UPDATE`;
    const batch = await tx.payoutBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { items: { select: { id: true, senderItemId: true, status: true, paypalItemId: true, transactionId: true, errorMessage: true } } },
    });
    if (batch.demo) return;
    const merge = mergeSnapshot(batch, snap);
    if (merge.batchStatus || merge.paypalBatchId) {
      await tx.payoutBatch.update({
        where: { id: batchId },
        data: { ...(merge.batchStatus && { status: merge.batchStatus }), ...(merge.paypalBatchId && { paypalBatchId: merge.paypalBatchId }), errorMessage: null },
      });
    }
    for (const u of merge.items) {
      await tx.payoutItem.update({ where: { id: u.id }, data: { status: u.to, paypalItemId: u.paypalItemId, transactionId: u.transactionId, errorMessage: u.errorMessage } });
    }

    if (merge.paypalBatchId && !batch.paypalBatchId) {
      await logActivity(tx, { jobId: batch.jobId, actor, type: "payout.submitted", message: `PayPal accepted batch ${batch.senderBatchId} (${snap.paypalBatchId}). Sandbox payouts are on their way.`, data: { batchId } });
    }
    if (merge.transitions.length > 0) {
      const statuses = batch.items.map((i) => merge.items.find((u) => u.id === i.id)?.to ?? i.status);
      await logActivity(tx, {
        jobId: batch.jobId,
        actor,
        type: "payout.status",
        message: `Batch ${batch.senderBatchId}: ${statusSummary(statuses)}.`,
        data: { batchId, transitions: merge.transitions },
      });
    }

    await settlePaid(tx, batch.jobId, actor);
  });
}

/** DONE → PAID once every person with approved pay has a SUCCESS item. */
async function settlePaid(tx: Tx, jobId: number, actor: Actor) {
  const data = await loadPayable(tx, jobId);
  if (!data || data.job.status !== "DONE") return;
  const items = await tx.payoutItem.findMany({ where: { batch: { jobId, demo: false } }, select: { workerId: true, status: true, amountCents: true } });
  if (!isJobPaid(data.recipients.map((r) => r.workerId), items)) return;
  const res = await tx.job.updateMany({ where: { id: jobId, status: "DONE" }, data: { status: "PAID" } });
  if (res.count === 0) return;
  const paid = items.filter((i) => i.status === "SUCCESS").reduce((n, i) => n + i.amountCents, 0);
  await logActivity(tx, { jobId, actor, type: "job.paid", message: `All ${data.recipients.length} people paid, ${formatEUR(paid)} in total. Job closed as Paid.` });
}

/** Re-checks every batch still in flight (optionally one job's), or one batch on request. Used by cron and the job page. */
export async function reconcile(opts: { jobId?: number; batchId?: number } = {}) {
  const batches = await db().payoutBatch.findMany({
    where: { demo: false, ...(opts.jobId && { jobId: opts.jobId }), ...(opts.batchId && { id: opts.batchId }) },
    select: { id: true, senderBatchId: true, status: true, demo: true, items: { select: { workerId: true, status: true } } },
  });
  const targets = opts.batchId ? batches : batches.filter(isBatchOpen);
  const results = [];
  for (const b of targets) {
    const r = await refreshBatch(b.id, "paypal");
    results.push({ batchId: b.id, senderBatchId: b.senderBatchId, ok: r.ok, message: r.message });
  }
  return results;
}
