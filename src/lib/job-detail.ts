import "server-only";
import { connection } from "next/server";
import type { AssignmentStatus, JobStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { initials } from "@/lib/format";
import { personPayCents } from "@/lib/pay";
import { checkAssignment, type Booking, type Conflict, type WorkerFacts } from "@/lib/planning/constraints";
import { loadPlanningContext } from "@/lib/planning/context";
import { roleLabel } from "@/lib/roles";
import { romeDayKey, romeHHMM } from "@/lib/time";

// Everything the job page renders, serializable for the client Scheduler.

export type SchedulerResource = { id: number; name: string; initials: string; role: Role; roleLabel: string; onJob: boolean };
export type SchedulerEvent = {
  id: number; // assignment id
  resourceId: number; // worker id
  shiftId: number;
  startDate: string; // ISO
  endDate: string;
  role: Role;
  status: AssignmentStatus;
  label: string; // "08:00–17:00 · Installer"
  reason: string | null;
  conflicts: Conflict[];
};

/** Lets the browser run the same checker while dragging. */
export type ValidationContext = { workers: WorkerFacts[]; bookings: Booking[]; minRestHours: number };

export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

export const EDITABLE_STATUSES: JobStatus[] = ["PLANNING", "CREW_CONFIRMED"];

export async function getJobDetail(id: number) {
  await connection();
  const job = await db().job.findUnique({
    where: { id },
    include: {
      shifts: {
        orderBy: [{ startsAt: "asc" }, { role: "asc" }],
        include: { assignments: { orderBy: { id: "asc" }, include: { worker: { select: { id: true, name: true, role: true, hourlyRateCents: true } } } } },
      },
      activity: { orderBy: { createdAt: "desc" }, take: 50 },
      payoutBatches: { select: { items: { select: { status: true, amountCents: true } } } },
    },
  });
  if (!job) return null;

  const ctx = await loadPlanningContext(job.startsAt, job.endsAt);
  const factsOf = new Map(ctx.facts.map((f) => [f.id, f]));

  const events: SchedulerEvent[] = [];
  for (const shift of job.shifts) {
    const slot = { shiftId: shift.id, role: shift.role, start: shift.startsAt.getTime(), end: shift.endsAt.getTime() };
    for (const a of shift.assignments) {
      const worker = factsOf.get(a.workerId);
      const conflicts =
        a.status === "DECLINED" || !worker
          ? []
          : checkAssignment({ worker, shift: slot, bookings: ctx.bookings, minRestHours: ctx.minRestHours, dayKey: romeDayKey, ignoreAssignmentId: a.id });
      events.push({
        id: a.id,
        resourceId: a.workerId,
        shiftId: shift.id,
        startDate: shift.startsAt.toISOString(),
        endDate: shift.endsAt.toISOString(),
        role: shift.role,
        status: a.status,
        label: `${romeHHMM(shift.startsAt)}–${romeHHMM(shift.endsAt)} · ${roleLabel[shift.role]}`,
        reason: a.reason,
        conflicts,
      });
    }
  }

  const onJob = new Set(events.filter((e) => e.status !== "DECLINED").map((e) => e.resourceId));
  const roleOrder: Role[] = ["MONTATORE", "ELETTRICISTA", "RIGGER", "AUTISTA"];
  const resources: SchedulerResource[] = ctx.workers
    .map((w) => ({ id: w.id, name: w.name, initials: initials(w.name), role: w.role, roleLabel: roleLabel[w.role], onJob: onJob.has(w.id) }))
    .sort((a, b) => Number(b.onJob) - Number(a.onJob) || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name));

  // Per-person hours and pay. Planned minutes already exclude unpaid breaks; overtime is per working day.
  type Person = { workerId: number; name: string; role: Role; rate: number; planned: { day: string; minutes: number }[]; actual: { day: string; minutes: number }[] | null };
  const byWorker = new Map<number, Person>();
  for (const shift of job.shifts) {
    const day = romeDayKey(shift.startsAt);
    for (const a of shift.assignments) {
      if (a.status === "DECLINED") continue;
      const p = byWorker.get(a.workerId) ?? { workerId: a.workerId, name: a.worker.name, role: a.worker.role, rate: a.worker.hourlyRateCents, planned: [], actual: [] };
      p.planned.push({ day, minutes: a.plannedMinutes });
      if (a.actualMinutes === null) p.actual = null;
      else p.actual?.push({ day, minutes: a.actualMinutes });
      byWorker.set(a.workerId, p);
    }
  }
  const people = new Map(
    [...byWorker.values()].map((p) => [
      p.workerId,
      {
        workerId: p.workerId,
        name: p.name,
        role: p.role,
        planned: p.planned.reduce((n, x) => n + x.minutes, 0),
        actual: p.actual ? p.actual.reduce((n, x) => n + x.minutes, 0) : null,
        plannedCents: personPayCents(p.planned, p.rate, ctx.rules),
        actualCents: p.actual ? personPayCents(p.actual, p.rate, ctx.rules) : null,
      },
    ]),
  );

  const live = events.filter((e) => e.status !== "DECLINED");
  const slots = job.shifts.reduce((n, s) => n + s.headcount, 0);
  const paidCents = job.payoutBatches.flatMap((b) => b.items).filter((i) => i.status === "SUCCESS").reduce((n, i) => n + i.amountCents, 0);
  const days = [...new Set(job.shifts.map((s) => romeDayKey(s.startsAt)))];

  const validation: ValidationContext = { workers: ctx.facts, bookings: ctx.bookings, minRestHours: ctx.minRestHours };

  return {
    job,
    days,
    events,
    resources,
    validation,
    people: [...people.values()],
    summary: {
      slots,
      filled: live.length,
      open: Math.max(0, slots - live.length),
      people: onJob.size,
      proposed: live.filter((e) => e.status === "PROPOSED").length,
      conflicts: live.filter((e) => e.conflicts.length > 0).length,
      plannedCents: [...people.values()].reduce((n, p) => n + p.plannedCents, 0),
      paidCents,
    },
    editable: EDITABLE_STATUSES.includes(job.status),
  };
}
