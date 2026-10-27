import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcile, type HoursRow } from "./hours";

const row = (id: number, workerId: number, name: string, day: string, planned: number, actual: number): HoursRow => ({
  assignmentId: id,
  workerId,
  name,
  day,
  dayLabel: day === "2026-11-14" ? "Sat 14 Nov" : "Sun 15 Nov",
  planned,
  actual,
});

test("exactly 15 minutes is not flagged; 16 is", () => {
  assert.deepEqual(reconcile([row(1, 1, "Luca Bianchi", "2026-11-14", 270, 285)], 480), []);
  assert.equal(reconcile([row(1, 1, "Luca Bianchi", "2026-11-14", 270, 286)], 480).length, 1);
});

test("shorter days are flagged too", () => {
  const [f] = reconcile([row(1, 1, "Luca Bianchi", "2026-11-14", 270, 240)], 480);
  assert.equal(f.delta, -30);
  assert.match(f.note, /Luca worked 30 min less than planned on Sat 14 Nov\./);
});

test("the note mentions overtime when the working day goes past the threshold", () => {
  // Morning 4h30 as planned, afternoon 4h30 → 5h: day total 9h30.
  const flags = reconcile(
    [row(1, 2, "Giulia Rossi", "2026-11-14", 270, 270), row(2, 2, "Giulia Rossi", "2026-11-14", 270, 300)],
    480,
  );
  assert.equal(flags.length, 1);
  assert.equal(flags[0].assignmentId, 2);
  assert.match(flags[0].note, /That day is now 9h 30m paid; overtime applies after 8h\./);
});
