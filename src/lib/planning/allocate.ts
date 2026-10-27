// Pure allocation: who may take a slot, and the final picks after the model has had its say.
// Shared by first-time planning and by rebalancing after a decline. No I/O, unit-tested.

import { checkAssignment, hasConfirmedAvailability, type Booking, type ShiftSlot, type WorkerFacts } from "./constraints";

export type OpenSlot = { slot: ShiftSlot; needed: number; minutes: number };
export type Pick = { workerId: number; reason: string };
export type Accepted = { shiftId: number; workerId: number; reason: string; plannedMinutes: number; source: "agent" | "rules" };

type Common = {
  workers: WorkerFacts[];
  bookings: Booking[];
  minRestHours: number;
  dayKey: (ms: number) => string;
  /** Workers who must not be offered a shift at all, per shift id: anyone who already has a row on it (incl. declined). */
  excluded: Map<number, Set<number>>;
};

/** People who may take this shift: hard constraints pass and they have never been on it (a decline is final). */
export function eligibleCandidates(slot: ShiftSlot, c: Common): WorkerFacts[] {
  const out = c.excluded.get(slot.shiftId) ?? new Set<number>();
  return c.workers.filter(
    (w) => !out.has(w.id) && checkAssignment({ worker: w, shift: slot, bookings: c.bookings, minRestHours: c.minRestHours, dayKey: c.dayKey }).length === 0,
  );
}

/**
 * Turns model picks into a valid allocation. Each pick is re-checked against existing bookings plus everything
 * accepted earlier in this run; picks outside the candidate list are dropped. Remaining slots are filled by rule:
 * people already chosen in this run first (continuity, e.g. both halves of a day), then availability marked yes,
 * then reliability, then lower rate.
 */
export function allocate(
  open: OpenSlot[],
  picks: Map<number, Pick[]>,
  c: Common & { rateOf: (workerId: number) => number },
): { accepted: Accepted[]; unfilled: { shiftId: number; missing: number; candidates: number }[] } {
  const bookings = [...c.bookings];
  const accepted: Accepted[] = [];
  const unfilled: { shiftId: number; missing: number; candidates: number }[] = [];
  const byId = new Map(c.workers.map((w) => [w.id, w]));

  for (const o of open) {
    const candidates = eligibleCandidates(o.slot, c);
    const allowed = (workerId: number) => {
      const w = byId.get(workerId);
      if (!w || !candidates.some((x) => x.id === workerId)) return false;
      if (accepted.some((a) => a.shiftId === o.slot.shiftId && a.workerId === workerId)) return false;
      return checkAssignment({ worker: w, shift: o.slot, bookings, minRestHours: c.minRestHours, dayKey: c.dayKey }).length === 0;
    };
    const take = (workerId: number, reason: string, source: Accepted["source"]) => {
      accepted.push({ shiftId: o.slot.shiftId, workerId, reason: reason.slice(0, 200), plannedMinutes: o.minutes, source });
      bookings.push({ assignmentId: -accepted.length, workerId, shiftId: o.slot.shiftId, start: o.slot.start, end: o.slot.end });
    };

    let filled = 0;
    for (const p of picks.get(o.slot.shiftId) ?? []) {
      if (filled >= o.needed) break;
      if (allowed(p.workerId)) {
        take(p.workerId, p.reason, "agent");
        filled++;
      }
    }

    const chosen = new Set(accepted.map((a) => a.workerId));
    const backups = candidates
      .map((w) => ({ w, continuity: chosen.has(w.id), marked: hasConfirmedAvailability(w, o.slot, c.dayKey), rate: c.rateOf(w.id) }))
      .sort(
        (a, b) =>
          Number(b.continuity) - Number(a.continuity) ||
          Number(b.marked) - Number(a.marked) ||
          b.w.reliability - a.w.reliability ||
          a.rate - b.rate ||
          a.w.id - b.w.id,
      );
    for (const b of backups) {
      if (filled >= o.needed) break;
      if (allowed(b.w.id)) {
        const why = b.continuity ? "Already on this job that day" : b.marked ? "Marked available" : "Qualified and free";
        take(b.w.id, `${why}; reliability ${b.w.reliability}.`, "rules");
        filled++;
      }
    }

    if (filled < o.needed) unfilled.push({ shiftId: o.slot.shiftId, missing: o.needed - filled, candidates: candidates.length });
  }
  return { accepted, unfilled };
}
