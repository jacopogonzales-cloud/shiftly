import assert from "node:assert/strict";
import { test } from "node:test";
import { crewPayCents, dayPayCents, personPayCents } from "./pay";

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
