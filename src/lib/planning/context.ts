import "server-only";
import { db } from "@/lib/db";
import type { Booking, WorkerFacts } from "@/lib/planning/constraints";
import { addDays, dateColumn, romeDayKey } from "@/lib/time";

const DAY = 86_400_000;

/**
 * Everything the constraint checker needs around a time window: crew with availability,
 * and every live booking (any job) close enough to matter for overlap and rest.
 */
export async function loadPlanningContext(from: Date, to: Date) {
  const firstDay = addDays(romeDayKey(from), -1);
  const lastDay = addDays(romeDayKey(to), 1);
  const [workers, bookings, settings] = await Promise.all([
    db().worker.findMany({
      orderBy: { name: "asc" },
      include: { availability: { where: { date: { gte: dateColumn(firstDay), lte: dateColumn(lastDay) } } } },
    }),
    db().assignment.findMany({
      where: {
        status: { not: "DECLINED" },
        shift: { startsAt: { lt: new Date(to.getTime() + 2 * DAY) }, endsAt: { gt: new Date(from.getTime() - 2 * DAY) } },
      },
      select: { id: true, workerId: true, shiftId: true, shift: { select: { startsAt: true, endsAt: true } } },
    }),
    db().settings.findUnique({ where: { id: 1 } }),
  ]);

  const facts: WorkerFacts[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    role: w.role,
    reliability: w.reliability,
    availability: Object.fromEntries(w.availability.map((a) => [a.date.toISOString().slice(0, 10), a.available])),
  }));

  const liveBookings: Booking[] = bookings.map((b) => ({
    assignmentId: b.id,
    workerId: b.workerId,
    shiftId: b.shiftId,
    start: b.shift.startsAt.getTime(),
    end: b.shift.endsAt.getTime(),
  }));

  return {
    workers,
    facts,
    bookings: liveBookings,
    minRestHours: settings?.minRestHours ?? 11,
    rules: { overtimeAfterMinutes: settings?.overtimeAfterMinutes ?? 480, overtimeMultiplier: settings?.overtimeMultiplier ?? 1.25 },
  };
}
