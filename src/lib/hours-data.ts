import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatDay, formatTimeRange } from "@/lib/format";
import { reconcile, type HoursRow } from "@/lib/hours";
import { romeDayKey } from "@/lib/time";

/** Confirmed assignments of a job as hours rows; actual defaults to planned until saved. */
export async function loadHours(jobId: number) {
  const [job, settings] = await Promise.all([
    db().job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
        shifts: {
          orderBy: { startsAt: "asc" },
          select: {
            startsAt: true,
            endsAt: true,
            role: true,
            breakMinutes: true,
            assignments: { where: { status: "CONFIRMED" }, select: { id: true, workerId: true, plannedMinutes: true, actualMinutes: true, worker: { select: { name: true } } } },
          },
        },
      },
    }),
    db().settings.findUnique({ where: { id: 1 }, select: { overtimeAfterMinutes: true } }),
  ]);
  if (!job) return null;
  const rows = job.shifts
    .flatMap((s) =>
      s.assignments.map((a) => ({
        assignmentId: a.id,
        workerId: a.workerId,
        name: a.worker.name,
        role: s.role,
        day: romeDayKey(s.startsAt),
        dayLabel: formatDay(s.startsAt),
        window: formatTimeRange(s.startsAt, s.endsAt),
        breakMinutes: s.breakMinutes,
        planned: a.plannedMinutes,
        actual: a.actualMinutes ?? a.plannedMinutes,
        saved: a.actualMinutes !== null,
      })),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name) || a.window.localeCompare(b.window));
  return { job, rows, overtimeAfterMinutes: settings?.overtimeAfterMinutes ?? 480, flags: reconcile(rows as HoursRow[], settings?.overtimeAfterMinutes ?? 480) };
}

export async function getHours(jobId: number) {
  await connection();
  return loadHours(jobId);
}
