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

  const own = bookings.filter((b) => b.workerId === worker.id && b.assignmentId !== ignoreAssignmentId);
  if (own.some((b) => b.start < shift.end && shift.start < b.end)) {
    conflicts.push({ kind: "overlap", message: `${first} is already booked at that time.` });
  }

  // Rest applies between working days, not between shifts of the same day (e.g. 08:00–12:30 and 13:30–18:00).
  // A working day is the Rome calendar day a shift starts on.
  const day = dayKey(shift.start);
  const sameDay = own.filter((b) => dayKey(b.start) === day);
  const isFirstOfDay = sameDay.every((b) => shift.start <= b.start);
  const isLastOfDay = sameDay.every((b) => shift.end >= b.end);
  const earlier = own.filter((b) => dayKey(b.start) < day);
  const later = own.filter((b) => dayKey(b.start) > day);
  const minRest = minRestHours * HOUR;
  const restMessage = (gap: number) => `${first} needs ${minRestHours} hours of rest between working days (only ${fmtGap(Math.max(0, gap))}).`;

  if (isFirstOfDay && earlier.length > 0) {
    const prevDay = earlier.reduce((d, b) => (dayKey(b.start) > d ? dayKey(b.start) : d), "");
    const lastEnd = Math.max(...earlier.filter((b) => dayKey(b.start) === prevDay).map((b) => b.end));
    const gap = shift.start - lastEnd;
    if (gap >= 0 && gap < minRest) conflicts.push({ kind: "rest", message: restMessage(gap) });
  }
  if (isLastOfDay && later.length > 0) {
    const nextDay = later.reduce((d, b) => (d === "" || dayKey(b.start) < d ? dayKey(b.start) : d), "");
    const firstStart = Math.min(...later.filter((b) => dayKey(b.start) === nextDay).map((b) => b.start));
    const gap = firstStart - shift.end;
    if (gap >= 0 && gap < minRest) conflicts.push({ kind: "rest", message: restMessage(gap) });
  }
  return conflicts;
}

/** True when the day has explicit availability data saying yes; used to rank, not to block. */
export function hasConfirmedAvailability(worker: WorkerFacts, shift: ShiftSlot, dayKey: (ms: number) => string): boolean {
  return worker.availability[dayKey(shift.start)] === true;
}
