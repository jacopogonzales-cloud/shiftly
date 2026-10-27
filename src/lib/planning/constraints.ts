// Hard scheduling constraints, checked by code and never delegated to the model.
// Pure and serializable so the same checks run on the server (planning, drop validation) and in the browser (drag preview).

import type { Role } from "@/generated/prisma/enums";

export type ShiftSlot = { shiftId: number; role: Role; start: number; end: number }; // epoch ms
export type Booking = { assignmentId: number; workerId: number; shiftId: number; start: number; end: number };
export type WorkerFacts = {
  id: number;
  name: string;
  role: Role;
  reliability: number;
  /** Rome day "YYYY-MM-DD" → available? Missing day = no data. */
  availability: Record<string, boolean>;
};

export type ConflictKind = "role" | "unavailable" | "overlap" | "rest";
export type Conflict = { kind: ConflictKind; message: string };

export type CheckInput = {
  worker: WorkerFacts;
  shift: ShiftSlot;
  /** Every live (non-declined) booking the worker has, across all jobs. */
  bookings: Booking[];
  minRestHours: number;
  dayKey: (ms: number) => string;
  /** Booking to ignore, e.g. the assignment being moved. */
  ignoreAssignmentId?: number;
};

const HOUR = 3_600_000;

function fmtGap(ms: number): string {
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / 60_000);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** All hard-constraint violations for putting `worker` on `shift`. Empty array = allowed. */
export function checkAssignment({ worker, shift, bookings, minRestHours, dayKey, ignoreAssignmentId }: CheckInput): Conflict[] {
  const first = worker.name.split(" ")[0];
  const conflicts: Conflict[] = [];

  if (worker.role !== shift.role) {
    conflicts.push({ kind: "role", message: `${first} is not qualified for this role.` });
  }

  for (let day = dayKey(shift.start), t = shift.start; t < shift.end; t += 24 * HOUR, day = dayKey(t)) {
    if (worker.availability[day] === false) {
      conflicts.push({ kind: "unavailable", message: `${first} marked ${day} as unavailable.` });
      break;
    }
  }

  const minRest = minRestHours * HOUR;
  for (const b of bookings) {
    if (b.workerId !== worker.id || b.assignmentId === ignoreAssignmentId) continue;
    if (b.start < shift.end && shift.start < b.end) {
      conflicts.push({ kind: "overlap", message: `${first} is already booked at that time.` });
      continue;
    }
    const gap = b.end <= shift.start ? shift.start - b.end : b.start - shift.end;
    if (gap < minRest) {
      conflicts.push({ kind: "rest", message: `${first} needs ${minRestHours} hours between shifts (only ${fmtGap(gap)}).` });
    }
  }
  return conflicts;
}

/** True when the day has explicit availability data saying yes; used to rank, not to block. */
export function hasConfirmedAvailability(worker: WorkerFacts, shift: ShiftSlot, dayKey: (ms: number) => string): boolean {
  return worker.availability[dayKey(shift.start)] === true;
}
