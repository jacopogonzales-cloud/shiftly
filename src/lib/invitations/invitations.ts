import "server-only";
import type { AssignmentStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { invitePath, readInviteToken } from "@/lib/invitations/link";
import { addDays, romeDateTime, romeDayKey } from "@/lib/time";

export type InviteState = "awaiting" | "accepted" | "declined" | "inactive";

/** Answer before 18:00 two days ahead of the first shift, or the shift start if that is sooner. */
export function respondBy(firstStart: Date): Date {
  const deadline = romeDateTime(addDays(romeDayKey(firstStart), -2), "18:00");
  return deadline < firstStart ? deadline : firstStart;
}

function stateOf(statuses: AssignmentStatus[]): InviteState {
  if (statuses.includes("SENT")) return "awaiting";
  if (statuses.length > 0 && statuses.every((s) => s === "CONFIRMED")) return "accepted";
  if (statuses.includes("DECLINED") && !statuses.includes("CONFIRMED")) return "declined";
  if (statuses.includes("CONFIRMED")) return "accepted";
  return "inactive";
}

const ANSWERABLE: AssignmentStatus[] = ["SENT", "CONFIRMED", "DECLINED"];

/** Everything the public page may show. Nothing about other crew members or pay. */
export async function loadInvitation(token: string) {
  const parsed = readInviteToken(token);
  if (!parsed) return { state: "inactive" as const };

  const [job, worker, settings] = await Promise.all([
    db().job.findUnique({
      where: { id: parsed.jobId },
      select: {
        id: true,
        title: true,
        site: true,
        status: true,
        shifts: {
          orderBy: { startsAt: "asc" },
          select: {
            startsAt: true,
            endsAt: true,
            role: true,
            breakMinutes: true,
            notes: true,
            assignments: { where: { workerId: parsed.workerId, status: { in: ANSWERABLE } }, select: { id: true, status: true, inviteMessage: true } },
          },
        },
      },
    }),
    db().worker.findUnique({ where: { id: parsed.workerId }, select: { name: true } }),
    db().settings.findUnique({ where: { id: 1 }, select: { companyName: true } }),
  ]);
  if (!job || !worker) return { state: "inactive" as const };

  const shifts = job.shifts.filter((s) => s.assignments.length > 0);
  if (shifts.length === 0) return { state: "inactive" as const };

  let state = stateOf(shifts.flatMap((s) => s.assignments.map((a) => a.status)));
  // Links are signed with the first shift start; once it has passed, open invitations can't be answered.
  if (state === "awaiting" && parsed.expiresAt.getTime() < Date.now()) state = "inactive";
  if (job.status !== "PLANNING" && state === "awaiting") state = "inactive";

  return {
    state,
    jobId: job.id,
    workerId: parsed.workerId,
    firstName: worker.name.split(" ")[0],
    company: settings?.companyName ?? "the operator",
    title: job.title,
    site: job.site,
    message: shifts.flatMap((s) => s.assignments).find((a) => a.inviteMessage)?.inviteMessage ?? null,
    respondBy: respondBy(shifts[0].startsAt),
    shifts: shifts.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, role: s.role as Role, breakMinutes: s.breakMinutes })),
  };
}

/** Operator view: one row per person with their link and status. */
export async function jobInvitations(jobId: number) {
  const assignments = await db().assignment.findMany({
    where: { shift: { jobId } },
    select: { workerId: true, status: true, respondedAt: true, declineReason: true, worker: { select: { name: true, role: true } }, shift: { select: { startsAt: true } } },
    orderBy: { id: "asc" },
  });
  const people = new Map<number, { workerId: number; name: string; role: Role; statuses: AssignmentStatus[]; shifts: number; firstStart: Date; respondedAt: Date | null; declineReason: string | null }>();
  for (const a of assignments) {
    const p = people.get(a.workerId) ?? { workerId: a.workerId, name: a.worker.name, role: a.worker.role, statuses: [], shifts: 0, firstStart: a.shift.startsAt, respondedAt: null, declineReason: null };
    p.statuses.push(a.status);
    p.shifts++;
    if (a.shift.startsAt < p.firstStart) p.firstStart = a.shift.startsAt;
    if (a.respondedAt && (!p.respondedAt || a.respondedAt > p.respondedAt)) p.respondedAt = a.respondedAt;
    if (a.declineReason) p.declineReason = a.declineReason;
    people.set(a.workerId, p);
  }
  return [...people.values()].map((p) => {
    const sent = p.statuses.some((s) => s !== "PROPOSED");
    const status: InviteState | "not-sent" = !sent ? "not-sent" : stateOf(p.statuses.filter((s) => s !== "PROPOSED"));
    // First shift among answerable ones decides the link expiry (must match loadInvitation).
    return {
      ...p,
      status,
      pending: p.statuses.filter((s) => s === "PROPOSED").length,
      link: sent ? invitePath(jobId, p.workerId, p.firstStart) : null,
    };
  });
}
