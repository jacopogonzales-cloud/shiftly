import "server-only";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";

/** PLANNING → CREW_CONFIRMED once every slot is held by someone who accepted. Idempotent. */
export async function settleCrew(jobId: number): Promise<boolean> {
  const job = await db().job.findUnique({
    where: { id: jobId },
    select: { status: true, shifts: { select: { headcount: true, assignments: { where: { status: { not: "DECLINED" } }, select: { status: true, workerId: true } } } } },
  });
  if (!job || job.status !== "PLANNING") return false;
  const slots = job.shifts.reduce((n, s) => n + s.headcount, 0);
  const live = job.shifts.flatMap((s) => s.assignments);
  const confirmed = live.filter((a) => a.status === "CONFIRMED");
  if (slots === 0 || confirmed.length < slots || live.length !== confirmed.length) return false;

  const people = new Set(confirmed.map((a) => a.workerId)).size;
  const updated = await db().$transaction(async (tx) => {
    const res = await tx.job.updateMany({ where: { id: jobId, status: "PLANNING" }, data: { status: "CREW_CONFIRMED" } });
    if (res.count === 0) return false;
    await logActivity(tx, {
      jobId,
      actor: "agent",
      type: "crew.confirmed",
      message: `All ${slots} slots accepted by ${people} ${people === 1 ? "person" : "people"}. Crew confirmed.`,
    });
    return true;
  });
  return updated;
}
