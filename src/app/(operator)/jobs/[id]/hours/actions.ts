"use server";

import { refresh } from "next/cache";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { formatDelta, formatMinutes } from "@/lib/format";
import { sumMinutes } from "@/lib/hours";
import { loadHours } from "@/lib/hours-data";

export type HoursResult = { ok: true; message: string } | { ok: false; message: string };

/** Store actual paid minutes; the agent flags every row more than 15 minutes off the plan. */
export async function saveHoursAction(jobId: number, entries: { assignmentId: number; actualMinutes: number }[]): Promise<HoursResult> {
  const current = await loadHours(jobId);
  if (!current) return { ok: false, message: "Job not found." };
  if (current.job.status !== "IN_PROGRESS") return { ok: false, message: "Hours can only be edited while the job is in progress." };
  const allowed = new Set(current.rows.map((r) => r.assignmentId));
  for (const e of entries) {
    if (!allowed.has(e.assignmentId)) return { ok: false, message: "A row no longer belongs to this job. Reload the page." };
    if (!Number.isInteger(e.actualMinutes) || e.actualMinutes < 0 || e.actualMinutes > 16 * 60 || e.actualMinutes % 15 !== 0) {
      return { ok: false, message: "Actual hours must be 0 to 16h in 15-minute steps." };
    }
  }

  await db().$transaction(async (tx) => {
    for (const e of entries) await tx.assignment.update({ where: { id: e.assignmentId }, data: { actualMinutes: e.actualMinutes } });
  });

  const after = (await loadHours(jobId))!;
  const flagged = after.flags;
  const totals = sumMinutes(after.rows);
  const names = flagged.slice(0, 3).map((f) => {
    const r = after.rows.find((x) => x.assignmentId === f.assignmentId)!;
    return `${r.name.split(" ")[0]} ${formatDelta(f.delta)} on ${r.dayLabel}`;
  });
  await db().$transaction(async (tx) => {
    await logActivity(tx, { jobId, actor: "operator", type: "hours.saved", message: `Actual hours saved: ${formatMinutes(totals.actual)} against ${formatMinutes(totals.planned)} planned.` });
    await logActivity(tx, {
      jobId,
      actor: "agent",
      type: "hours.reconciled",
      message:
        flagged.length === 0
          ? "All hours are within 15 minutes of the plan."
          : `${flagged.length} ${flagged.length === 1 ? "difference" : "differences"} over 15 min: ${names.join(", ")}${flagged.length > 3 ? ", …" : ""}. Review before approving.`,
      data: { flags: flagged },
    });
  });
  refresh();
  return { ok: true, message: flagged.length === 0 ? "Hours saved. Everything matches the plan." : `Hours saved. ${flagged.length} to review.` };
}

/**
 * Operator signs off: every flagged row must be marked reviewed. IN_PROGRESS → DONE.
 * Rows never saved are approved as shown, i.e. at their planned minutes, and stored as such.
 */
export async function approveHoursAction(jobId: number, reviewed: number[], explanation: string): Promise<HoursResult> {
  const current = await loadHours(jobId);
  if (!current) return { ok: false, message: "Job not found." };
  if (current.job.status !== "IN_PROGRESS") return { ok: false, message: "Only a job in progress can have its hours approved." };
  if (current.rows.length === 0) return { ok: false, message: "No completed shifts to approve." };
  const missing = current.flags.filter((f) => !reviewed.includes(f.assignmentId));
  if (missing.length > 0) return { ok: false, message: `Mark ${missing.length} flagged ${missing.length === 1 ? "row" : "rows"} as reviewed first.` };

  const totals = sumMinutes(current.rows);
  const note = explanation.trim().slice(0, 500);
  await db().$transaction(async (tx) => {
    const res = await tx.job.updateMany({ where: { id: jobId, status: "IN_PROGRESS" }, data: { status: "DONE" } });
    if (res.count === 0) throw new Error("status changed");
    const prefilled = current.rows.filter((r) => !r.saved);
    for (const r of prefilled) await tx.assignment.update({ where: { id: r.assignmentId }, data: { actualMinutes: r.planned } });
    await logActivity(tx, {
      jobId,
      actor: "operator",
      type: "hours.confirmed",
      message: `Hours approved: ${formatMinutes(totals.actual)} across ${current.rows.length} shifts${current.flags.length ? `, ${current.flags.length} ${current.flags.length === 1 ? "difference" : "differences"} reviewed` : ""}.${note ? ` Note: ${note}` : ""}`,
      data: { reviewed, actualMinutes: totals.actual, plannedMinutes: totals.planned },
    });
  });
  refresh();
  return { ok: true, message: "Hours approved. The job is done and ready to pay." };
}
