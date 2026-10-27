"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { AIError } from "@/lib/ai/openai";
import { extractJob, type ExtractedJob } from "@/lib/ai/extract";
import { db } from "@/lib/db";
import { planJob } from "@/lib/planning/plan";
import { romeDateTime } from "@/lib/time";

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
    return { ok: true, message: res.proposed === 0 && res.unfilled === 0 ? res.summary : `${res.proposed} assignments proposed${res.unfilled ? `, ${res.unfilled} slots unfilled` : ""}. Review before sending.` };
  } catch (err) {
    console.error("planJobAction", err);
    return { ok: false, message: "Couldn't build a plan. Nothing was saved." };
  }
}
