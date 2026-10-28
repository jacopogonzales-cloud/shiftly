import assert from "node:assert/strict";
import { test } from "node:test";
import { crewPayCents, dayPayCents, payLines, personPayCents } from "./pay";

const rules = { overtimeAfterMinutes: 480, overtimeMultiplier: 1.25 };

test("8h at 38,00 €/h is 304,00 €, no overtime", () => {
  assert.equal(dayPayCents(480, 3800, rules), 30400);
});

test("overtime after 8 paid hours at 1.25×", () => {
  // 8h × 38 + 0.5h × 47,50 = 327,75
  assert.equal(dayPayCents(510, 3800, rules), 32775);
});

test("split shifts on one day are one working day for overtime: 4h30 + 4h30 = 9h", () => {
  // 8h × 20 + 1h × 25 = 185,00 (per-shift overtime would wrongly give 180,00)
  assert.equal(personPayCents([{ day: "2026-11-14", minutes: 270 }, { day: "2026-11-14", minutes: 270 }], 2000, rules), 18500);
});

test("each working day gets its own threshold", () => {
  const twoDays = [
    { day: "2026-11-14", minutes: 270 },
    { day: "2026-11-14", minutes: 270 },
    { day: "2026-11-15", minutes: 480 },
  ];
  assert.equal(personPayCents(twoDays, 2000, rules), 18500 + 16000);
});

test("crew totals group by worker before applying day overtime", () => {
  const shifts = [
    { workerId: 1, day: "2026-11-14", minutes: 270, hourlyRateCents: 2000 },
    { workerId: 2, day: "2026-11-14", minutes: 270, hourlyRateCents: 2000 },
    { workerId: 1, day: "2026-11-14", minutes: 270, hourlyRateCents: 2000 },
  ];
  assert.equal(crewPayCents(shifts, rules), 18500 + 9000);
});

test("rounds to the cent", () => {
  assert.equal(dayPayCents(7, 1650, rules), 193); // 7 min × 16,50 €/h = 1,925 → 1,93
});

test("payLines: the design reference crew totals 3.015,75 € with Giulia's 30 min overtime", () => {
  const crew = [
    { id: 1, rate: 2800 },
    { id: 2, rate: 3800 },
    { id: 3, rate: 3500 },
    { id: 4, rate: 2800 },
    { id: 5, rate: 2800 },
    { id: 6, rate: 3000 },
  ];
  const shifts = crew.flatMap((w) => [
    { workerId: w.id, day: "2026-10-22", minutes: w.id === 2 ? 510 : 480, hourlyRateCents: w.rate },
    { workerId: w.id, day: "2026-10-23", minutes: 480, hourlyRateCents: w.rate },
  ]);
  const lines = payLines(shifts, rules);
  assert.deepEqual(
    lines.map((l) => l.amountCents),
    [44800, 63175, 56000, 44800, 44800, 48000],
  );
  assert.deepEqual(lines[1], { workerId: 2, minutes: 990, overtimeMinutes: 30, amountCents: 63175 });
  assert.equal(lines.reduce((n, l) => n + l.amountCents, 0), 301575);
});

test("payLines: per-worker total is the sum of rounded days, and matches crewPayCents", () => {
  const shifts = [
    { workerId: 7, day: "2026-11-14", minutes: 7, hourlyRateCents: 1650 },
    { workerId: 7, day: "2026-11-15", minutes: 7, hourlyRateCents: 1650 },
    { workerId: 3, day: "2026-11-14", minutes: 300, hourlyRateCents: 1750 },
    { workerId: 3, day: "2026-11-14", minutes: 270, hourlyRateCents: 1750 },
  ];
  const lines = payLines(shifts, rules);
  assert.deepEqual(lines.map((l) => l.workerId), [3, 7]);
  assert.equal(lines[1].amountCents, 193 * 2); // each day rounds on its own
  assert.equal(lines[0].overtimeMinutes, 90); // 9h30 in one day
  assert.equal(lines.reduce((n, l) => n + l.amountCents, 0), crewPayCents(shifts, rules));
});

test("payLines: nobody with zero approved minutes is paid", () => {
  assert.deepEqual(payLines([{ workerId: 1, day: "2026-11-14", minutes: 0, hourlyRateCents: 2000 }], rules), []);
});
