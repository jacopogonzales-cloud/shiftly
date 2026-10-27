import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAssignment, type Booking, type WorkerFacts } from "./constraints";

const H = 3_600_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const t0 = Date.UTC(2026, 10, 14, 7); // 14 Nov 2026 07:00Z

const giulia: WorkerFacts = { id: 1, name: "Giulia Rossi", role: "ELETTRICISTA", reliability: 90, availability: { "2026-11-14": true } };
const shift = { shiftId: 10, role: "ELETTRICISTA" as const, start: t0, end: t0 + 9 * H };
const base = { worker: giulia, shift, bookings: [] as Booking[], minRestHours: 11, dayKey: day };

test("qualified, free, rested: no conflicts", () => {
  assert.deepEqual(checkAssignment(base), []);
});

test("wrong role is a hard conflict", () => {
  const kinds = checkAssignment({ ...base, shift: { ...shift, role: "RIGGER" } }).map((c) => c.kind);
  assert.deepEqual(kinds, ["role"]);
});

test("explicitly unavailable day blocks; missing data does not", () => {
  assert.deepEqual(checkAssignment({ ...base, worker: { ...giulia, availability: { "2026-11-14": false } } }).map((c) => c.kind), ["unavailable"]);
  assert.deepEqual(checkAssignment({ ...base, worker: { ...giulia, availability: {} } }), []);
});

test("overlapping booking blocks", () => {
  const b: Booking = { assignmentId: 1, workerId: 1, shiftId: 99, start: t0 + 2 * H, end: t0 + 4 * H };
  assert.deepEqual(checkAssignment({ ...base, bookings: [b] }).map((c) => c.kind), ["overlap"]);
});

test("same shift counts as already booked", () => {
  const b: Booking = { assignmentId: 1, workerId: 1, shiftId: 10, start: shift.start, end: shift.end };
  assert.deepEqual(checkAssignment({ ...base, bookings: [b] }).map((c) => c.kind), ["overlap"]);
});

test("rest under 11h blocks, exactly 11h is fine", () => {
  const short: Booking = { assignmentId: 1, workerId: 1, shiftId: 99, start: t0 - 10 * H, end: t0 - 10 * H + 1 }; // ends ~10h before
  const exact: Booking = { assignmentId: 2, workerId: 1, shiftId: 98, start: t0 - 20 * H, end: t0 - 11 * H };
  assert.deepEqual(checkAssignment({ ...base, bookings: [short] }).map((c) => c.kind), ["rest"]);
  assert.deepEqual(checkAssignment({ ...base, bookings: [exact] }), []);
});

test("the assignment being moved is ignored", () => {
  const self: Booking = { assignmentId: 7, workerId: 1, shiftId: 10, start: shift.start, end: shift.end };
  assert.deepEqual(checkAssignment({ ...base, bookings: [self], ignoreAssignmentId: 7 }), []);
});

test("other workers' bookings are irrelevant", () => {
  const other: Booking = { assignmentId: 1, workerId: 2, shiftId: 99, start: t0, end: t0 + H };
  assert.deepEqual(checkAssignment({ ...base, bookings: [other] }), []);
});
