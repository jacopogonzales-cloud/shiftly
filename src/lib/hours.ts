// Hours reconciliation (pure). Planned vs actual paid minutes per assignment; anything more than 15 minutes
// off is flagged with a one-sentence note. Exactly 15 minutes is not flagged.

export const FLAG_OVER_MINUTES = 15;

export type HoursRow = { assignmentId: number; workerId: number; name: string; day: string; dayLabel: string; planned: number; actual: number };
export type Flag = { assignmentId: number; delta: number; note: string };

function fmt(minutes: number): string {
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
}

export function reconcile(rows: HoursRow[], overtimeAfterMinutes: number): Flag[] {
  const dayTotal = new Map<string, number>();
  for (const r of rows) dayTotal.set(`${r.workerId}:${r.day}`, (dayTotal.get(`${r.workerId}:${r.day}`) ?? 0) + r.actual);

  return rows
    .filter((r) => Math.abs(r.actual - r.planned) > FLAG_OVER_MINUTES)
    .map((r) => {
      const delta = r.actual - r.planned;
      const first = r.name.split(" ")[0];
      const total = dayTotal.get(`${r.workerId}:${r.day}`) ?? r.actual;
      const base = `${first} worked ${fmt(delta)} ${delta > 0 ? "longer" : "less"} than planned on ${r.dayLabel}.`;
      const overtime = delta > 0 && total > overtimeAfterMinutes ? ` That day is now ${fmt(total)} paid; overtime applies after ${fmt(overtimeAfterMinutes)}.` : "";
      return { assignmentId: r.assignmentId, delta, note: `${base}${overtime} Review before approving.` };
    });
}

export function sumMinutes(rows: { planned: number; actual: number }[]) {
  return rows.reduce((t, r) => ({ planned: t.planned + r.planned, actual: t.actual + r.actual }), { planned: 0, actual: 0 });
}
