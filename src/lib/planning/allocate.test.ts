import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate, eligibleCandidates, type OpenSlot } from "./allocate";
import type { Booking, WorkerFacts } from "./constraints";

// 14 Nov 2026, CET: hh Rome = hh-1 UTC.
const at = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh - 1, mm);
const rome = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(ms);

const installer = (id: number, name: string, reliability: number, availability: Record<string, boolean> = {}): WorkerFacts => ({
  id,
  name,
  role: "MONTATORE",
  reliability,
  availability,
});
const luca = installer(1, "Luca Bianchi", 92);
const paolo = installer(2, "Paolo Ferrari", 83, { "2026-11-14": true });
const simone = installer(3, "Simone Conti", 76, { "2026-11-14": true });
const giulia: WorkerFacts = { id: 4, name: "Giulia Rossi", role: "ELETTRICISTA", reliability: 99, availability: {} };

const am = { shiftId: 10, role: "MONTATORE" as const, start: at(14, 8), end: at(14, 12, 30) };
const pm = { shiftId: 11, role: "MONTATORE" as const, start: at(14, 13, 30), end: at(14, 18) };
const slot = (s: typeof am, needed = 1): OpenSlot => ({ slot: s, needed, minutes: 270 });

// Luca declined both halves of the 14th: his rows stay on the shifts, so he is excluded from them.
const excludedAfterDecline = new Map([
  [10, new Set([1])],
  [11, new Set([1])],
]);
const base = { workers: [luca, paolo, simone, giulia], bookings: [] as Booking[], minRestHours: 11, dayKey: rome, rateOf: () => 1700 };

test("rebalance: the decliner is never a candidate again for the shifts they declined", () => {
  const ids = eligibleCandidates(am, { ...base, excluded: excludedAfterDecline }).map((w) => w.id);
  assert.deepEqual(ids, [2, 3]); // not Luca (declined), not Giulia (wrong role)
});

test("rebalance: a model pick of the decliner or of an ineligible person is dropped and the slot still filled", () => {
  const picks = new Map([[10, [{ workerId: 1, reason: "x" }, { workerId: 4, reason: "y" }]]]);
  const { accepted, unfilled } = allocate([slot(am)], picks, { ...base, excluded: excludedAfterDecline });
  assert.equal(unfilled.length, 0);
  assert.deepEqual(accepted.map((a) => [a.workerId, a.source]), [[2, "rules"]]); // Paolo: marked available, more reliable than Simone
});

test("rebalance: a valid model pick is kept with its reason", () => {
  const picks = new Map([[10, [{ workerId: 3, reason: "Lives near Rho." }]]]);
  const { accepted } = allocate([slot(am)], picks, { ...base, excluded: excludedAfterDecline });
  assert.deepEqual(accepted.map((a) => [a.workerId, a.reason, a.source]), [[3, "Lives near Rho.", "agent"]]);
});

test("rebalance: one replacement covers both halves of the same working day (continuity first)", () => {
  // Model picks Simone for the morning only; the afternoon fallback prefers someone already chosen in this run.
  const picks = new Map([[10, [{ workerId: 3, reason: "Free all day." }]]]);
  const { accepted } = allocate([slot(am), slot(pm)], picks, { ...base, excluded: excludedAfterDecline });
  assert.deepEqual(accepted.map((a) => [a.shiftId, a.workerId]), [
    [10, 3],
    [11, 3],
  ]);
});

test("rebalance: the same person is not put twice on one shift", () => {
  const picks = new Map([[10, [{ workerId: 2, reason: "a" }, { workerId: 2, reason: "b" }]]]);
  const { accepted } = allocate([slot(am, 2)], picks, { ...base, excluded: excludedAfterDecline });
  assert.deepEqual(accepted.map((a) => a.workerId).sort(), [2, 3]);
});

test("rebalance: rest rule is checked against picks made earlier in the same run", () => {
  // Late shift on the 14th ends 23:00; early shift on the 15th starts 06:00 → 7h rest. Only Paolo is eligible for both.
  const late = { shiftId: 20, role: "MONTATORE" as const, start: at(14, 18), end: at(14, 23) };
  const early = { shiftId: 21, role: "MONTATORE" as const, start: at(15, 6), end: at(15, 10) };
  const onlyPaolo = { ...base, workers: [paolo], excluded: new Map() };
  const { accepted, unfilled } = allocate([slot(late), slot(early)], new Map(), onlyPaolo);
  assert.deepEqual(accepted.map((a) => [a.shiftId, a.workerId]), [[20, 2]]);
  assert.deepEqual(unfilled, [{ shiftId: 21, missing: 1, candidates: 1 }]);
});

test("rebalance: nobody left reports the gap instead of inventing a pick", () => {
  const everyoneOut = new Map([[10, new Set([1, 2, 3])]]);
  const { accepted, unfilled } = allocate([slot(am)], new Map([[10, [{ workerId: 2, reason: "x" }]]]), { ...base, excluded: everyoneOut });
  assert.equal(accepted.length, 0);
  assert.deepEqual(unfilled, [{ shiftId: 10, missing: 1, candidates: 0 }]);
});

test("rebalance: someone booked elsewhere at the same time is skipped", () => {
  const busy: Booking = { assignmentId: 99, workerId: 2, shiftId: 77, start: at(14, 9), end: at(14, 11) };
  const { accepted } = allocate([slot(am)], new Map(), { ...base, bookings: [busy], excluded: excludedAfterDecline });
  assert.deepEqual(accepted.map((a) => a.workerId), [3]);
});
