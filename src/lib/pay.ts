// Pay rules. Pure functions, integer cents in and out.
// Overtime is counted on the paid minutes of a whole working day (all of a person's shifts that start
// on the same Rome calendar day), not per shift: 08:00–12:30 + 13:30–18:00 is one 9-hour day.

export type PayRules = { overtimeAfterMinutes: number; overtimeMultiplier: number };

export const DEFAULT_PAY_RULES: PayRules = { overtimeAfterMinutes: 480, overtimeMultiplier: 1.25 };

/** Pay for one working day's paid minutes. Rounded to the cent. */
export function dayPayCents(minutes: number, hourlyRateCents: number, rules: PayRules = DEFAULT_PAY_RULES): number {
  const regular = Math.min(minutes, rules.overtimeAfterMinutes);
  const overtime = Math.max(0, minutes - rules.overtimeAfterMinutes);
  return Math.round(((regular + overtime * rules.overtimeMultiplier) * hourlyRateCents) / 60);
}

/** Pay for one person across shifts: minutes are summed per working day, then each day is paid. */
export function personPayCents(shifts: { day: string; minutes: number }[], hourlyRateCents: number, rules: PayRules = DEFAULT_PAY_RULES): number {
  const perDay = new Map<string, number>();
  for (const s of shifts) perDay.set(s.day, (perDay.get(s.day) ?? 0) + s.minutes);
  let total = 0;
  for (const minutes of perDay.values()) total += dayPayCents(minutes, hourlyRateCents, rules);
  return total;
}

/** Total for many people: groups by worker, then applies personPayCents with each worker's rate. */
export function crewPayCents(
  shifts: { workerId: number; day: string; minutes: number; hourlyRateCents: number }[],
  rules: PayRules = DEFAULT_PAY_RULES,
): number {
  const byWorker = new Map<number, { rate: number; shifts: { day: string; minutes: number }[] }>();
  for (const s of shifts) {
    const w = byWorker.get(s.workerId) ?? { rate: s.hourlyRateCents, shifts: [] };
    w.shifts.push({ day: s.day, minutes: s.minutes });
    byWorker.set(s.workerId, w);
  }
  let total = 0;
  for (const w of byWorker.values()) total += personPayCents(w.shifts, w.rate, rules);
  return total;
}

export type PayLine = { workerId: number; minutes: number; overtimeMinutes: number; amountCents: number };

/**
 * Per-worker pay for a job from approved minutes: what the Pay crew dialog shows and what a payout sends.
 * Each working day is rounded to the cent on its own, so the total is always the sum of what people see.
 * Sorted by worker id; workers with no paid minutes are left out.
 */
export function payLines(
  shifts: { workerId: number; day: string; minutes: number; hourlyRateCents: number }[],
  rules: PayRules = DEFAULT_PAY_RULES,
): PayLine[] {
  const byWorker = new Map<number, { rate: number; days: Map<string, number> }>();
  for (const s of shifts) {
    const w = byWorker.get(s.workerId) ?? { rate: s.hourlyRateCents, days: new Map<string, number>() };
    w.days.set(s.day, (w.days.get(s.day) ?? 0) + s.minutes);
    byWorker.set(s.workerId, w);
  }
  return [...byWorker.entries()]
    .map(([workerId, w]) => {
      const days = [...w.days.values()];
      return {
        workerId,
        minutes: days.reduce((n, m) => n + m, 0),
        overtimeMinutes: days.reduce((n, m) => n + Math.max(0, m - rules.overtimeAfterMinutes), 0),
        amountCents: days.reduce((n, m) => n + dayPayCents(m, w.rate, rules), 0),
      };
    })
    .filter((l) => l.minutes > 0)
    .sort((a, b) => a.workerId - b.workerId);
}
