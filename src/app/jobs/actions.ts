"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { AIError } from "@/lib/ai/openai";
import { extractJob, type ExtractedJob } from "@/lib/ai/extract";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { EDITABLE_STATUSES } from "@/lib/job-detail";
import { checkAssignment } from "@/lib/planning/constraints";
import { loadPlanningContext } from "@/lib/planning/context";
import { planJob } from "@/lib/planning/plan";
import { romeDateTime, romeDayKey } from "@/lib/time";

const ROLES: Role[] = ["MONTATORE", "ELETTRICISTA", "RIGGER", "AUTISTA"];

export type ExtractResult = { ok: true; job: ExtractedJob } | { ok: false; error: string };

export async function extractBriefAction(brief: string): Promise<ExtractResult> {
  const text = brief.trim();
  if (text.length < 20) return { ok: false, error: "Add a little more detail: dates, roles and times." };
  if (text.length > 4000) return { ok: false, error: "Keep the brief under 4,000 characters." };
  try {
    const { job } = await extractJob(text);
    return { ok: true, job };
  } catch (err) {
    console.error("extractBriefAction", err);
    return { ok: false, error: err instanceof AIError ? "Couldn't generate the plan. The AI service did not answer." : "Couldn't generate the plan." };
  }
}

export type DraftShift = { date: string; start: string; end: string; breakMinutes: number; role: Role; headcount: number; notes: string };
export type DraftJob = {
  brief: string;
  title: string;
  client: string;
  site: string;
  budgetEur: number | null;
  shifts: DraftShift[];
  assumptions: string[];
  missing: string[];
};

export type CreateResult = { ok: false; error: string; field?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(d: DraftJob): CreateResult | null {
  if (!d.title.trim()) return { ok: false, error: "Give the job a title.", field: "title" };
  if (!d.site.trim()) return { ok: false, error: "Add the venue so the crew knows where to go.", field: "site" };
  if (d.budgetEur !== null && (!Number.isFinite(d.budgetEur) || d.budgetEur < 0)) return { ok: false, error: "Budget must be 0 or more.", field: "budget" };
  if (d.shifts.length === 0) return { ok: false, error: "Add at least one shift.", field: "shifts" };
  for (const [i, s] of d.shifts.entries()) {
    const row = `Shift ${i + 1}`;
    if (!DATE.test(s.date) || Number.isNaN(Date.parse(s.date))) return { ok: false, error: `${row}: we couldn't confirm the date. Use YYYY-MM-DD.`, field: `shift-${i}` };
    if (!TIME.test(s.start) || !TIME.test(s.end)) return { ok: false, error: `${row}: times must be HH:MM.`, field: `shift-${i}` };
    if (!ROLES.includes(s.role)) return { ok: false, error: `${row}: pick a role.`, field: `shift-${i}` };
    if (!Number.isInteger(s.headcount) || s.headcount < 1 || s.headcount > 50) return { ok: false, error: `${row}: headcount must be 1 to 50.`, field: `shift-${i}` };
    if (!Number.isInteger(s.breakMinutes) || s.breakMinutes < 0 || s.breakMinutes > 240) return { ok: false, error: `${row}: break must be 0 to 240 minutes.`, field: `shift-${i}` };
  }
  return null;
}

/** Creates the job in PLANNING with its shifts. No crew is contacted. */
export async function createJobAction(draft: DraftJob): Promise<CreateResult> {
  const invalid = validate(draft);
  if (invalid) return invalid;

  const shifts = draft.shifts.map((s) => {
    const startsAt = romeDateTime(s.date, s.start);
    let endsAt = romeDateTime(s.date, s.end);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000); // overnight shift
    return { ...s, startsAt, endsAt };
  });
  for (const [i, s] of shifts.entries()) {
    if ((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000 <= s.breakMinutes) {
      return { ok: false, error: `Shift ${i + 1}: the break is longer than the shift.`, field: `shift-${i}` };
    }
  }

  const job = await db().$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        title: draft.title.trim(),
        client: draft.client.trim() || "—",
        site: draft.site.trim(),
        startsAt: new Date(Math.min(...shifts.map((s) => s.startsAt.getTime()))),
        endsAt: new Date(Math.max(...shifts.map((s) => s.endsAt.getTime()))),
        status: "PLANNING",
        budgetCents: Math.round((draft.budgetEur ?? 0) * 100),
        requirementsText: draft.brief.trim(),
        requirements: { shifts: draft.shifts, assumptions: draft.assumptions, missing: draft.missing },
        shifts: {
          create: shifts.map((s) => ({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            role: s.role,
            headcount: s.headcount,
            breakMinutes: s.breakMinutes,
            notes: s.notes.trim() || null,
          })),
        },
      },
    });
    const slots = draft.shifts.reduce((n, s) => n + s.headcount, 0);
    await logActivity(tx, {
      jobId: created.id,
      actor: "agent",
      type: "requirements.extracted",
      message: `Read the brief: ${draft.shifts.length} shift lines, ${slots} crew slots.${draft.assumptions.length ? ` ${draft.assumptions.length} assumption${draft.assumptions.length > 1 ? "s" : ""} to check.` : ""}`,
      data: { assumptions: draft.assumptions, missing: draft.missing },
    });
    await logActivity(tx, { jobId: created.id, actor: "operator", type: "job.created", message: "Details confirmed. Job created in Planning." });
    return created;
  });

  redirect(`/jobs/${job.id}`);
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function planJobAction(jobId: number): Promise<ActionResult> {
  const job = await db().job.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) return { ok: false, message: "Job not found." };
  if (job.status !== "PLANNING") return { ok: false, message: "Planning is only open while the job is in Planning." };
  try {
    const res = await planJob(jobId);
    refresh();
    if (res.unfilled > 0) return { ok: false, message: res.summary };
    return { ok: true, message: res.proposed === 0 ? res.summary : `${res.proposed} assignments proposed. Review before sending.` };
  } catch (err) {
    console.error("planJobAction", err);
    return { ok: false, message: "Couldn't build a plan. Nothing was saved." };
  }
}

/** Drag & drop: give an assignment to another person. Hard constraints are re-checked here, whatever the browser allowed. */
export async function moveAssignmentAction(assignmentId: number, toWorkerId: number): Promise<ActionResult> {
  const a = await db().assignment.findUnique({
    where: { id: assignmentId },
    include: { worker: { select: { name: true } }, shift: { include: { job: { select: { id: true, status: true } } } } },
  });
  if (!a) return { ok: false, message: "That assignment no longer exists. Reload the page." };
  if (!EDITABLE_STATUSES.includes(a.shift.job.status)) return { ok: false, message: "Schedule is locked once the job has started." };
  if (a.status === "DECLINED") return { ok: false, message: "Declined invitations stay in the history; plan a replacement instead." };
  if (a.workerId === toWorkerId) return { ok: true, message: "No change." };

  const ctx = await loadPlanningContext(a.shift.startsAt, a.shift.endsAt);
  const target = ctx.facts.find((w) => w.id === toWorkerId);
  if (!target) return { ok: false, message: "That person is not in your crew." };
  const conflicts = checkAssignment({
    worker: target,
    shift: { shiftId: a.shiftId, role: a.shift.role, start: a.shift.startsAt.getTime(), end: a.shift.endsAt.getTime() },
    bookings: ctx.bookings,
    minRestHours: ctx.minRestHours,
    dayKey: romeDayKey,
    ignoreAssignmentId: a.id,
  });
  if (conflicts.length > 0) return { ok: false, message: conflicts[0].message };
  const previous = await db().assignment.findUnique({ where: { shiftId_workerId: { shiftId: a.shiftId, workerId: toWorkerId } }, select: { status: true } });
  if (previous) return { ok: false, message: `${target.name.split(" ")[0]} already declined this shift.` };

  const from = a.worker.name.split(" ")[0];
  const to = target.name.split(" ")[0];
  await db().$transaction(async (tx) => {
    // A new person means a new invitation: back to PROPOSED with a fresh link.
    await tx.assignment.update({
      where: { id: a.id },
      data: { workerId: toWorkerId, status: "PROPOSED", token: randomBytes(16).toString("base64url"), reason: `Moved by the operator from ${from}.` },
    });
    await logActivity(tx, {
      jobId: a.shift.job.id,
      actor: "operator",
      type: "assignment.moved",
      message: `${to} replaces ${from} on ${formatDay(a.shift.startsAt)}. Constraints re-checked: all clear.`,
      data: { assignmentId: a.id, fromWorkerId: a.workerId, toWorkerId, previousStatus: a.status },
    });
  });
  refresh();
  return { ok: true, message: `${to} now has this shift. Proposed, not sent.` };
}
