import "server-only";
import { randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { structured } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { formatDay, formatEUR } from "@/lib/format";
import { crewPayCents } from "@/lib/pay";
import { checkAssignment, hasConfirmedAvailability, type Booking, type ShiftSlot, type WorkerFacts } from "@/lib/planning/constraints";
import { loadPlanningContext } from "@/lib/planning/context";
import { roleLabel } from "@/lib/roles";
import { romeDayKey, romeHHMM } from "@/lib/time";

// Task (b): fill open slots. Code decides who is allowed; the model only chooses among allowed people
// and explains why. Every pick is re-checked before it is saved.

type Pick = { workerId: number; reason: string };
type ModelPlan = { summary: string; shifts: { shiftId: number; picks: Pick[] }[] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "shifts"],
  properties: {
    summary: { type: "string", description: "One sentence for the operator on the trade-off behind the picks. No numbers, costs or totals. Max 120 characters." },
    shifts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["shiftId", "picks"],
        properties: {
          shiftId: { type: "integer" },
          picks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["workerId", "reason"],
              properties: {
                workerId: { type: "integer" },
                reason: { type: "string", description: "One sentence, max 120 characters, why this person. No apologies." },
              },
            },
          },
        },
      },
    },
  },
};

const token = () => randomBytes(16).toString("base64url");

const plural = (role: Role, n: number) => `${roleLabel[role]}${n === 1 ? "" : "s"}`;

/** One sentence the operator can act on: not enough people of a role at all, or not enough free that day. */
function infeasibleReason(role: Role, needed: number, inCrew: number, free: number, day: Date): string {
  if (inCrew < needed) return `Your crew has ${inCrew} ${plural(role, inCrew)}; this job needs ${needed} per shift. Reduce headcount or add crew.`;
  return `Only ${free} of ${inCrew} ${plural(role, inCrew)} are free on ${formatDay(day)}. Reduce headcount, move the date or add crew.`;
}

export type PlanResult = { proposed: number; unfilled: number; summary: string };

/** Rank for deterministic fallback: confirmed availability, then reliability, then lower rate. */
function rank(a: { confirmed: boolean; reliability: number; rate: number }, b: typeof a) {
  return Number(b.confirmed) - Number(a.confirmed) || b.reliability - a.reliability || a.rate - b.rate;
}

export async function planJob(jobId: number): Promise<PlanResult> {
  const job = await db().job.findUniqueOrThrow({
    where: { id: jobId },
    include: { shifts: { orderBy: { startsAt: "asc" }, include: { assignments: { where: { status: { not: "DECLINED" } } } } } },
  });
  const ctx = await loadPlanningContext(job.startsAt, job.endsAt);
  const rateOf = new Map(ctx.workers.map((w) => [w.id, w.hourlyRateCents]));
  const factsOf = new Map(ctx.facts.map((f) => [f.id, f]));

  const open = job.shifts
    .map((s) => ({ shift: s, slot: { shiftId: s.id, role: s.role, start: s.startsAt.getTime(), end: s.endsAt.getTime() } as ShiftSlot, needed: s.headcount - s.assignments.length }))
    .filter((o) => o.needed > 0);

  if (open.length === 0) return { proposed: 0, unfilled: 0, summary: "Every slot already has someone. Nothing to plan." };

  // Candidates per shift against existing bookings only. The model sees just these.
  const candidates = new Map<number, WorkerFacts[]>();
  for (const o of open) {
    const ok = ctx.facts.filter((w) => checkAssignment({ worker: w, shift: o.slot, bookings: ctx.bookings, minRestHours: ctx.minRestHours, dayKey: romeDayKey }).length === 0);
    candidates.set(o.shift.id, ok);
  }

  const prompt = {
    job: { title: job.title, site: job.site, budgetEur: job.budgetCents / 100 },
    rules: { minRestHours: ctx.minRestHours, note: "Candidates already satisfy role, availability, overlap and rest rules on their own. Picking the same person for two shifts may still break the rest rule; prefer continuity only when shifts are on different days." },
    shifts: open.map((o) => ({
      shiftId: o.shift.id,
      day: romeDayKey(o.shift.startsAt),
      time: `${romeHHMM(o.shift.startsAt)}-${romeHHMM(o.shift.endsAt)}`,
      role: roleLabel[o.shift.role],
      needed: o.needed,
      candidates: (candidates.get(o.shift.id) ?? []).map((w) => ({
        workerId: w.id,
        name: w.name,
        reliability: w.reliability,
        hourlyRateEur: (rateOf.get(w.id) ?? 0) / 100,
        markedAvailableThatDay: hasConfirmedAvailability(w, o.slot, romeDayKey),
      })),
    })),
  };

  let modelPlan: ModelPlan | null = null;
  let model: string | null = null;
  try {
    const res = await structured<ModelPlan>({
      name: "crew_plan",
      schema,
      system: [
        "You staff event-crew shifts for an operator in Milan.",
        "Pick exactly `needed` people per shift, only from that shift's candidates (by workerId).",
        "Prefer people marked available that day and high reliability; keep cost within budget; reuse the same people across days when it helps continuity.",
        "Each reason is one plain sentence about this person for this shift. English. No hype, no apologies.",
        "Nobody has been contacted yet: never say a person confirmed, accepted or agreed. Say 'marked available' for availability.",
      ].join("\n"),
      user: JSON.stringify(prompt),
    });
    modelPlan = res.data;
    model = res.model;
  } catch (err) {
    // The deterministic fallback below still produces a valid plan; the log says the agent was unavailable.
    console.error("planJob: model call failed", err);
  }

  // Re-check every pick in order, including against picks already accepted in this run.
  const bookings: Booking[] = [...ctx.bookings];
  const accepted: { shiftId: number; workerId: number; day: string; reason: string; plannedMinutes: number; source: "agent" | "rules" }[] = [];
  let unfilled = 0;
  const unfilledNotes: string[] = [];

  for (const o of open) {
    const minutes = Math.round((o.slot.end - o.slot.start) / 60_000) - o.shift.breakMinutes;
    const allowed = (workerId: number) => {
      const w = factsOf.get(workerId);
      if (!w || !(candidates.get(o.shift.id) ?? []).some((c) => c.id === workerId)) return false;
      if (accepted.some((a) => a.shiftId === o.shift.id && a.workerId === workerId)) return false;
      return checkAssignment({ worker: w, shift: o.slot, bookings, minRestHours: ctx.minRestHours, dayKey: romeDayKey }).length === 0;
    };
    const take = (workerId: number, reason: string, source: "agent" | "rules") => {
      accepted.push({ shiftId: o.shift.id, workerId, day: romeDayKey(o.shift.startsAt), reason: reason.slice(0, 200), plannedMinutes: minutes, source });
      bookings.push({ assignmentId: -accepted.length, workerId, shiftId: o.shift.id, start: o.slot.start, end: o.slot.end });
    };

    let filled = 0;
    const picks = modelPlan?.shifts.find((s) => s.shiftId === o.shift.id)?.picks ?? [];
    for (const p of picks) {
      if (filled >= o.needed) break;
      if (allowed(p.workerId)) {
        take(p.workerId, p.reason, "agent");
        filled++;
      }
    }

    const backups = (candidates.get(o.shift.id) ?? [])
      .map((w) => ({ w, confirmed: hasConfirmedAvailability(w, o.slot, romeDayKey), reliability: w.reliability, rate: rateOf.get(w.id) ?? 0 }))
      .sort(rank);
    for (const b of backups) {
      if (filled >= o.needed) break;
      if (allowed(b.w.id)) {
        take(b.w.id, `Qualified and free; reliability ${b.reliability}${b.confirmed ? ", marked available that day" : ""}.`, "rules");
        filled++;
      }
    }

    if (filled < o.needed) {
      unfilled += o.needed - filled;
      unfilledNotes.push(infeasibleReason(o.shift.role, o.shift.headcount, ctx.facts.filter((w) => w.role === o.shift.role).length, (candidates.get(o.shift.id) ?? []).length, o.shift.startsAt));
    }
  }

  const costCents = crewPayCents(
    accepted.map((a) => ({ workerId: a.workerId, day: a.day, minutes: a.plannedMinutes, hourlyRateCents: rateOf.get(a.workerId) ?? 0 })),
    ctx.rules,
  );
  const people = new Set(accepted.map((a) => a.workerId)).size;
  // Figures come from code, never from the model.
  const totalSlots = open.reduce((n, o) => n + o.needed, 0);
  const facts = `${accepted.length} assignments for ${people} ${people === 1 ? "person" : "people"}, planned ${formatEUR(costCents)}${job.budgetCents > 0 ? ` of ${formatEUR(job.budgetCents)} budget` : ""}.`;
  const why = modelPlan?.summary?.trim() || "Agent offline: ranked by availability and reliability.";
  // Infeasible plans get a short, actionable message instead of the model's paragraph.
  const summary =
    unfilled > 0
      ? `${[...new Set(unfilledNotes)].slice(0, 2).join(" ")} Filled ${accepted.length} of ${totalSlots} slots.`
      : `${why} ${facts}`;

  await db().$transaction(async (tx) => {
    for (const a of accepted) {
      await tx.assignment.create({
        data: { shiftId: a.shiftId, workerId: a.workerId, status: "PROPOSED", plannedMinutes: a.plannedMinutes, reason: a.reason, token: token() },
      });
    }
    await logActivity(tx, {
      jobId,
      actor: "agent",
      type: "plan.proposed",
      message: summary,
      data: {
        model,
        agentAvailable: model !== null,
        proposed: accepted.length,
        people,
        unfilled,
        plannedCostCents: costCents,
        picks: accepted.map((a) => ({ shiftId: a.shiftId, workerId: a.workerId, source: a.source })),
      },
    });
  });

  console.info(`planJob ${jobId}: ${accepted.length} proposed, ${unfilled} unfilled, planned ${formatEUR(costCents)}, agent ${model ? "used" : "offline"}`);
  return { proposed: accepted.length, unfilled, summary };
}
