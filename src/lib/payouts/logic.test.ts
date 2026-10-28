import assert from "node:assert/strict";
import { test } from "node:test";
import { isBatchOpen, isJobPaid, mergeSnapshot, nextAttempt, planPayout, retryLines, statusSummary, type BatchFacts, type StoredItem } from "./logic";

const lines = [
  { workerId: 5, amountCents: 30526 },
  { workerId: 10, amountCents: 33251 },
  { workerId: 11, amountCents: 31450 },
];
const batch = (id: number, n: number, status: string, items: [number, string][], demo = false): BatchFacts => ({
  id,
  senderBatchId: `job-4-${n}`,
  status,
  demo,
  items: items.map(([workerId, s]) => ({ workerId, status: s })),
});

test("first payout creates job-{id}-1 with one item per person and ids from the brief", () => {
  const plan = planPayout({ jobId: 4, lines, batches: [] });
  assert.equal(plan.kind, "create");
  if (plan.kind !== "create") return;
  assert.equal(plan.senderBatchId, "job-4-1");
  assert.deepEqual(plan.items.map((i) => i.senderItemId), ["job-4-worker-5-1", "job-4-worker-10-1", "job-4-worker-11-1"]);
  assert.equal(plan.totalCents, 30526 + 33251 + 31450);
});

test("a second click while the batch is in flight reuses it", () => {
  for (const status of ["DRAFT", "PENDING", "PROCESSING"]) {
    const plan = planPayout({ jobId: 4, lines, batches: [batch(7, 1, status, [[5, "DRAFT"], [10, "DRAFT"], [11, "DRAFT"]])] });
    assert.deepEqual(plan, { kind: "reuse", batchId: 7 }, status);
  }
  // Batch header already SUCCESS but an item still pending: still in flight.
  assert.deepEqual(planPayout({ jobId: 4, lines, batches: [batch(7, 1, "SUCCESS", [[5, "SUCCESS"], [10, "PENDING"]])] }), { kind: "reuse", batchId: 7 });
});

test("a worker with a SUCCESS item for the job is never paid twice", () => {
  const plan = planPayout({ jobId: 4, lines, batches: [batch(7, 1, "SUCCESS", [[5, "SUCCESS"], [10, "FAILED"], [11, "SUCCESS"]])] });
  assert.equal(plan.kind, "create");
  if (plan.kind !== "create") return;
  assert.deepEqual(plan.items.map((i) => i.workerId), [10]);
  assert.deepEqual(plan.skipped, [5, 11]);
  assert.equal(plan.senderBatchId, "job-4-2");
  assert.equal(plan.items[0].senderItemId, "job-4-worker-10-2");
});

test("unclaimed or on-hold money is not sent again either", () => {
  const plan = planPayout({ jobId: 4, lines, batches: [batch(7, 1, "SUCCESS", [[5, "UNCLAIMED"], [10, "SUCCESS"], [11, "FAILED"]])] });
  assert.equal(plan.kind, "create");
  if (plan.kind === "create") assert.deepEqual(plan.items.map((i) => i.workerId), [11]);
});

test("nothing to do once everyone is paid", () => {
  const plan = planPayout({ jobId: 4, lines, batches: [batch(7, 1, "SUCCESS", [[5, "SUCCESS"], [10, "SUCCESS"], [11, "SUCCESS"]])] });
  assert.equal(plan.kind, "nothing");
});

test("a request PayPal rejected moved no money: paying again starts a new attempt for everyone", () => {
  const plan = planPayout({ jobId: 4, lines, batches: [batch(7, 1, "REJECTED", [[5, "REJECTED"], [10, "REJECTED"], [11, "REJECTED"]])] });
  assert.equal(plan.kind, "create");
  if (plan.kind === "create") {
    assert.equal(plan.senderBatchId, "job-4-2");
    assert.equal(plan.items.length, 3);
  }
});

test("demo batches are never in flight and attempt numbers keep counting past gaps", () => {
  assert.equal(isBatchOpen({ status: "PENDING", demo: true, items: [] }), false);
  assert.equal(nextAttempt(4, [{ senderBatchId: "job-4-1" }, { senderBatchId: "job-4-3" }, { senderBatchId: "job-14-9" }]), 4);
});

test("retry takes FAILED items only, at their approved amounts", () => {
  const items = [
    { workerId: 5, status: "FAILED", amountCents: 100 },
    { workerId: 10, status: "UNCLAIMED", amountCents: 200 },
    { workerId: 11, status: "PENDING", amountCents: 300 },
    { workerId: 12, status: "SUCCESS", amountCents: 400 },
  ];
  assert.deepEqual(retryLines({ items }), [{ workerId: 5, amountCents: 100 }]);
});

const stored = (id: number, status: string, extra: Partial<StoredItem> = {}): StoredItem => ({
  id,
  senderItemId: `job-4-worker-${id}-1`,
  status,
  paypalItemId: null,
  transactionId: null,
  errorMessage: null,
  ...extra,
});
const snapItem = (id: number, status: string, error: string | null = null) => ({ senderItemId: `job-4-worker-${id}-1`, paypalItemId: `ITEM${id}`, transactionId: status === "SUCCESS" ? `TX${id}` : null, status, error });

test("applying the same PayPal snapshot twice is a no-op the second time", () => {
  const current = { status: "DRAFT", paypalBatchId: null as string | null, items: [stored(1, "DRAFT"), stored(2, "DRAFT")] };
  const snap = { paypalBatchId: "B1", batchStatus: "SUCCESS", items: [snapItem(1, "SUCCESS"), snapItem(2, "UNCLAIMED", "Receiver is unregistered")] };
  const first = mergeSnapshot(current, snap);
  assert.equal(first.batchStatus, "SUCCESS");
  assert.equal(first.paypalBatchId, "B1");
  assert.deepEqual(first.transitions.map((t) => t.to), ["SUCCESS", "UNCLAIMED"]);
  assert.equal(first.items[1].errorMessage, "Receiver is unregistered");

  // Rows after the first apply.
  const after = {
    status: "SUCCESS",
    paypalBatchId: "B1",
    items: first.items.map((u, i) => ({ ...current.items[i], status: u.to, paypalItemId: u.paypalItemId, transactionId: u.transactionId, errorMessage: u.errorMessage })),
  };
  assert.deepEqual(mergeSnapshot(after, snap), { batchStatus: null, paypalBatchId: null, items: [], transitions: [] });
});

test("an older snapshot never moves a status backwards", () => {
  const current = { status: "SUCCESS", paypalBatchId: "B1", items: [stored(1, "SUCCESS", { paypalItemId: "ITEM1", transactionId: "TX1" })] };
  const stale = { paypalBatchId: "B1", batchStatus: "PROCESSING", items: [{ ...snapItem(1, "PENDING"), transactionId: null }] };
  const m = mergeSnapshot(current, stale);
  assert.equal(m.batchStatus, null);
  assert.deepEqual(m.transitions, []);
  assert.deepEqual(m.items, []);
});

test("unclaimed money can still be claimed, and a paid item can come back as returned", () => {
  const unclaimed = { status: "SUCCESS", paypalBatchId: "B1", items: [stored(1, "UNCLAIMED", { paypalItemId: "ITEM1", errorMessage: "Receiver is unregistered" })] };
  const claimed = mergeSnapshot(unclaimed, { paypalBatchId: "B1", batchStatus: "SUCCESS", items: [snapItem(1, "SUCCESS")] });
  assert.deepEqual(claimed.transitions, [{ id: 1, from: "UNCLAIMED", to: "SUCCESS" }]);
  assert.equal(claimed.items[0].errorMessage, null);

  const paid = { status: "SUCCESS", paypalBatchId: "B1", items: [stored(1, "SUCCESS", { paypalItemId: "ITEM1", transactionId: "TX1" })] };
  const returned = mergeSnapshot(paid, { paypalBatchId: "B1", batchStatus: "SUCCESS", items: [{ ...snapItem(1, "RETURNED"), transactionId: "TX1" }] });
  assert.deepEqual(returned.transitions, [{ id: 1, from: "SUCCESS", to: "RETURNED" }]);
});

test("items PayPal doesn't know about are left alone", () => {
  const m = mergeSnapshot({ status: "PENDING", paypalBatchId: "B1", items: [stored(9, "PENDING")] }, { paypalBatchId: "B1", batchStatus: "PENDING", items: [snapItem(1, "PENDING")] });
  assert.deepEqual(m.items, []);
});

test("a job is paid only when every payable person has a SUCCESS item", () => {
  assert.equal(isJobPaid([5, 10], [{ workerId: 5, status: "SUCCESS" }, { workerId: 10, status: "UNCLAIMED" }]), false);
  assert.equal(isJobPaid([5, 10], [{ workerId: 5, status: "SUCCESS" }, { workerId: 10, status: "FAILED" }, { workerId: 10, status: "SUCCESS" }]), true);
  assert.equal(isJobPaid([], []), false);
});

test("status summary reads in a fixed order", () => {
  assert.equal(statusSummary(["UNCLAIMED", "SUCCESS", "PENDING", "UNCLAIMED", "FAILED", "SUCCESS"]), "2 paid · 1 pending · 2 unclaimed · 1 failed");
});
