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

test("rest under 11h between working days blocks, exactly 11h is fine", () => {
  const short: Booking = { assignmentId: 1, workerId: 1, shiftId: 99, start: t0 - 14 * H, end: t0 - 10 * H }; // previous day, ends 10h before
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

// --- Working days: rest applies between days, not between shifts of the same day -----------------

const rome = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(ms);
// 14 Nov 2026 is CET (UTC+1): 08:00 Rome = 07:00Z.
const at = (day: number, hh: number, mm = 0) => Date.UTC(2026, 10, day, hh - 1, mm);
const morning = (day: number, id: number): Booking => ({ assignmentId: id, workerId: 1, shiftId: 100 + id, start: at(day, 8), end: at(day, 12, 30) });
const afternoon = (day: number, id: number): Booking => ({ assignmentId: id, workerId: 1, shiftId: 100 + id, start: at(day, 13, 30), end: at(day, 18) });
const slotOf = (b: Booking) => ({ shiftId: b.shiftId, role: "ELETTRICISTA" as const, start: b.start, end: b.end });
const romeBase = { worker: { ...giulia, availability: {} }, minRestHours: 11, dayKey: rome };

test("same day, morning + afternoon split by a break: allowed (one working day)", () => {
  assert.deepEqual(checkAssignment({ ...romeBase, shift: slotOf(afternoon(14, 2)), bookings: [morning(14, 1)] }), []);
  assert.deepEqual(checkAssignment({ ...romeBase, shift: slotOf(morning(14, 1)), bookings: [afternoon(14, 2)] }), []);
});

test("two full split days back to back: 18:00 → 08:00 is 14h, allowed", () => {
  const bookings = [morning(14, 1), afternoon(14, 2), afternoon(15, 4)];
  assert.deepEqual(checkAssignment({ ...romeBase, shift: slotOf(morning(15, 3)), bookings }), []);
});

test("rest is measured from the last shift of a day to the first shift of the next", () => {
  const lateEnd: Booking = { assignmentId: 1, workerId: 1, shiftId: 201, start: at(14, 18), end: at(14, 23) };
  const early: Booking = { assignmentId: 2, workerId: 1, shiftId: 202, start: at(15, 6), end: at(15, 9) }; // 7h after 23:00
  const kinds = checkAssignment({ ...romeBase, shift: slotOf(early), bookings: [morning(14, 3), lateEnd] }).map((c) => c.kind);
  assert.deepEqual(kinds, ["rest"]);
  // A later shift on the 15th is not the first of its day, so the short night is not blamed on it.
  const noon: Booking = { assignmentId: 4, workerId: 1, shiftId: 204, start: at(15, 13), end: at(15, 17) };
  assert.deepEqual(checkAssignment({ ...romeBase, shift: slotOf(noon), bookings: [lateEnd, early] }), []);
});

test("rest is also checked forward: a late shift before an early next morning", () => {
  const nextMorning: Booking = { assignmentId: 1, workerId: 1, shiftId: 301, start: at(15, 6), end: at(15, 12) };
  const late = { shiftId: 302, role: "ELETTRICISTA" as const, start: at(14, 20), end: at(14, 23) };
  assert.deepEqual(checkAssignment({ ...romeBase, shift: late, bookings: [nextMorning] }).map((c) => c.kind), ["rest"]);
});

test("overlap within the same day is still blocked", () => {
  const clash = { shiftId: 400, role: "ELETTRICISTA" as const, start: at(14, 12), end: at(14, 14) };
  assert.deepEqual(checkAssignment({ ...romeBase, shift: clash, bookings: [morning(14, 1)] }).map((c) => c.kind), ["overlap"]);
});
