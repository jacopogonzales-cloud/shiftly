// Payout rules (pure). Which batch to create or reuse, how a PayPal snapshot updates our rows, when a job is paid.
// Statuses are PayPal's own strings, plus two of ours: DRAFT (row saved, PayPal's answer not confirmed yet)
// and REJECTED (PayPal refused the request, so nothing was created and no money moved).

/** Item states where money may still reach the person: never pay them again for the same job. */
const COMMITTED = new Set(["DRAFT", "NEW", "PENDING", "PROCESSING", "ONHOLD", "UNCLAIMED", "SUCCESS"]);
/** Item states still moving on PayPal's side, worth polling. UNCLAIMED waits on the recipient, not on PayPal. */
const IN_FLIGHT_ITEM = new Set(["DRAFT", "NEW", "PENDING", "PROCESSING", "ONHOLD"]);
const IN_FLIGHT_BATCH = new Set(["DRAFT", "NEW", "PENDING", "PROCESSING"]);

export type ItemFacts = { workerId: number; status: string };
export type BatchFacts = { id: number; senderBatchId: string; status: string; demo: boolean; items: ItemFacts[] };

export function isBatchOpen(b: Pick<BatchFacts, "status" | "demo" | "items">): boolean {
  return !b.demo && (IN_FLIGHT_BATCH.has(b.status) || b.items.some((i) => IN_FLIGHT_ITEM.has(i.status)));
}

export const senderBatchId = (jobId: number, n: number) => `job-${jobId}-${n}`;
export const senderItemId = (jobId: number, workerId: number, n: number) => `job-${jobId}-worker-${workerId}-${n}`;

/** Next attempt number for a job: one past the highest "job-{id}-{n}" seen. */
export function nextAttempt(jobId: number, batches: Pick<BatchFacts, "senderBatchId">[]): number {
  const prefix = `job-${jobId}-`;
  let max = 0;
  for (const b of batches) {
    if (!b.senderBatchId.startsWith(prefix)) continue;
    const n = Number(b.senderBatchId.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export type PayoutPlan =
  | { kind: "reuse"; batchId: number }
  | { kind: "nothing"; reason: string }
  | {
      kind: "create";
      n: number;
      senderBatchId: string;
      items: { workerId: number; amountCents: number; senderItemId: string }[];
      totalCents: number;
      /** People left out because a payout for this job already reached them or may still do so. */
      skipped: number[];
    };

/**
 * Decides what a "Pay crew" or "Retry failed" click does.
 * - A batch still in flight for the job is reused: a second click never creates a second batch.
 * - Anyone with a SUCCESS item for the job, or an item that may still pay out, is left out.
 */
export function planPayout(input: { jobId: number; lines: { workerId: number; amountCents: number }[]; batches: BatchFacts[] }): PayoutPlan {
  const open = input.batches.find(isBatchOpen);
  if (open) return { kind: "reuse", batchId: open.id };

  const committed = new Set(input.batches.flatMap((b) => b.items.filter((i) => COMMITTED.has(i.status)).map((i) => i.workerId)));
  const payable = input.lines.filter((l) => l.amountCents > 0 && !committed.has(l.workerId));
  const skipped = input.lines.filter((l) => committed.has(l.workerId)).map((l) => l.workerId);
  if (payable.length === 0) return { kind: "nothing", reason: skipped.length ? "Everyone on this job has already been paid or has a payout on the way." : "No approved pay to send." };

  const n = nextAttempt(input.jobId, input.batches);
  const items = payable.map((l) => ({ workerId: l.workerId, amountCents: l.amountCents, senderItemId: senderItemId(input.jobId, l.workerId, n) }));
  return { kind: "create", n, senderBatchId: senderBatchId(input.jobId, n), items, totalCents: items.reduce((t, i) => t + i.amountCents, 0), skipped };
}

/** Lines for "Retry failed": only FAILED items of that batch, at the amounts already approved. */
export function retryLines(batch: { items: (ItemFacts & { amountCents: number })[] }) {
  return batch.items.filter((i) => i.status === "FAILED").map((i) => ({ workerId: i.workerId, amountCents: i.amountCents }));
}

// --- applying PayPal's view ------------------------------------------------------------

// Later states never step back to earlier ones, so an old webhook or a slow fetch can't undo progress.
const ITEM_RANK: Record<string, number> = { DRAFT: 0, NEW: 1, PENDING: 1, PROCESSING: 1, ONHOLD: 2, UNCLAIMED: 2 };
const BATCH_RANK: Record<string, number> = { DRAFT: 0, NEW: 1, PENDING: 1, PROCESSING: 2 };
const FINAL = 3; // SUCCESS, FAILED, RETURNED, REFUNDED, BLOCKED, CANCELED, DENIED, REJECTED: all final
const rank = (table: Record<string, number>, s: string) => table[s] ?? FINAL;

export type StoredItem = { id: number; senderItemId: string; status: string; paypalItemId: string | null; transactionId: string | null; errorMessage: string | null };
export type SnapshotItem = { senderItemId: string; paypalItemId: string; transactionId: string | null; status: string; error: string | null };
export type Snapshot = { paypalBatchId: string; batchStatus: string; items: SnapshotItem[] };

export type ItemUpdate = { id: number; from: string; to: string; paypalItemId: string; transactionId: string | null; errorMessage: string | null };
export type Merge = { batchStatus: string | null; paypalBatchId: string | null; items: ItemUpdate[]; transitions: { id: number; from: string; to: string }[] };

/**
 * What a PayPal snapshot changes in our rows. Applying the same snapshot twice changes nothing the second time.
 * Items are matched by our senderItemId; unknown items are ignored.
 */
export function mergeSnapshot(current: { status: string; paypalBatchId: string | null; items: StoredItem[] }, snap: Snapshot): Merge {
  const bySender = new Map(snap.items.map((i) => [i.senderItemId, i]));
  const items: ItemUpdate[] = [];
  const transitions: Merge["transitions"] = [];
  for (const cur of current.items) {
    const s = bySender.get(cur.senderItemId);
    if (!s) continue;
    const forward = s.status !== cur.status && rank(ITEM_RANK, s.status) >= rank(ITEM_RANK, cur.status);
    const to = forward ? s.status : cur.status;
    const errorMessage = forward ? s.error : (cur.errorMessage ?? s.error);
    const transactionId = s.transactionId ?? cur.transactionId;
    if (to === cur.status && s.paypalItemId === cur.paypalItemId && transactionId === cur.transactionId && errorMessage === cur.errorMessage) continue;
    items.push({ id: cur.id, from: cur.status, to, paypalItemId: s.paypalItemId, transactionId, errorMessage });
    if (to !== cur.status) transitions.push({ id: cur.id, from: cur.status, to });
  }
  const batchForward = snap.batchStatus !== current.status && rank(BATCH_RANK, snap.batchStatus) >= rank(BATCH_RANK, current.status);
  return {
    batchStatus: batchForward ? snap.batchStatus : null,
    paypalBatchId: current.paypalBatchId === snap.paypalBatchId ? null : snap.paypalBatchId,
    items,
    transitions,
  };
}

/** Paid means every person with approved pay has a SUCCESS item for the job. */
export function isJobPaid(payableWorkerIds: number[], items: ItemFacts[]): boolean {
  const paid = new Set(items.filter((i) => i.status === "SUCCESS").map((i) => i.workerId));
  return payableWorkerIds.length > 0 && payableWorkerIds.every((w) => paid.has(w));
}

/** "3 paid · 1 pending · 4 unclaimed", in a fixed order. */
export function statusSummary(statuses: string[]): string {
  const label = (s: string) =>
    s === "SUCCESS" ? "paid" : IN_FLIGHT_ITEM.has(s) && s !== "ONHOLD" ? "pending" : s === "ONHOLD" ? "on hold" : s.toLowerCase();
  const order = ["paid", "pending", "on hold", "unclaimed", "failed"];
  const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(label(s), (counts.get(label(s)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => pos(a[0]) - pos(b[0]))
    .map(([k, n]) => `${n} ${k}`)
    .join(" · ");
}
