"use server";

import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { readInviteToken } from "@/lib/invitations/link";
import { DECLINE_REASONS } from "@/lib/invitations/reasons";
import { settleCrew } from "@/lib/lifecycle";
import { planJob } from "@/lib/planning/plan";

export type RespondResult = { ok: true; state: "accepted" | "declined" } | { ok: false; message: string };

/** Public: a crew member answers their invitation. Only invitations still awaiting an answer change. */
export async function respondAction(token: string, decision: "accept" | "decline", reason?: string): Promise<RespondResult> {
  const parsed = readInviteToken(token);
  if (!parsed || parsed.expiresAt.getTime() < Date.now()) return { ok: false, message: "This invitation link is no longer active." };

  const job = await db().job.findUnique({ where: { id: parsed.jobId }, select: { status: true } });
  const open = await db().assignment.findMany({
    where: { workerId: parsed.workerId, status: "SENT", shift: { jobId: parsed.jobId } },
    select: { id: true, shiftId: true, shift: { select: { startsAt: true } }, worker: { select: { name: true } } },
  });

  if (!job || job.status !== "PLANNING" || open.length === 0) {
    // Already answered (or withdrawn): report the stored decision, never apply a second one.
    const answered = await db().assignment.findFirst({
      where: { workerId: parsed.workerId, shift: { jobId: parsed.jobId }, status: { in: ["CONFIRMED", "DECLINED"] } },
      orderBy: { respondedAt: "desc" },
      select: { status: true },
    });
    if (answered) return { ok: true, state: answered.status === "CONFIRMED" ? "accepted" : "declined" };
    return { ok: false, message: "This invitation link is no longer active." };
  }

  const ids = open.map((a) => a.id);
  const name = open[0].worker.name;
  const days = [...new Set(open.map((a) => formatDay(a.shift.startsAt)))].join(", ");
  const why = reason && (DECLINE_REASONS as readonly string[]).includes(reason) ? reason : null;
  const now = new Date();

  const changed = await db().$transaction(async (tx) => {
    const res = await tx.assignment.updateMany({
      where: { id: { in: ids }, status: "SENT" },
      data: decision === "accept" ? { status: "CONFIRMED", respondedAt: now } : { status: "DECLINED", respondedAt: now, declineReason: why },
    });
    if (res.count === 0) return 0;
    await logActivity(tx, {
      jobId: parsed.jobId,
      actor: "crew",
      type: decision === "accept" ? "invitation.accepted" : "invitation.declined",
      message:
        decision === "accept"
          ? `${name} accepted ${res.count} ${res.count === 1 ? "shift" : "shifts"} (${days}).`
          : `${name} declined ${res.count} ${res.count === 1 ? "shift" : "shifts"} (${days})${why ? `: ${why.toLowerCase()}` : ""}.`,
      data: { workerId: parsed.workerId, assignmentIds: ids, reason: why },
    });
    return res.count;
  });
  if (changed === 0) return { ok: true, state: decision === "accept" ? "accepted" : "declined" };

  if (decision === "accept") {
    await settleCrew(parsed.jobId);
    return { ok: true, state: "accepted" };
  }

  // Re-plan only the declined shifts, after the response is sent so the crew member isn't kept waiting.
  const shiftIds = [...new Set(open.map((a) => a.shiftId))];
  after(async () => {
    try {
      await planJob(parsed.jobId, { shiftIds, rebalance: { declinedWorkerId: parsed.workerId, declinedName: name } });
    } catch (err) {
      console.error("rebalance after decline failed", err);
    }
  });
  return { ok: true, state: "declined" };
}
