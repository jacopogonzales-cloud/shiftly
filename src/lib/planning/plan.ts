import "server-only";
import { randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { structured } from "@/lib/ai/openai";
import { db } from "@/lib/db";
import { formatDay, formatEUR } from "@/lib/format";
import { crewPayCents } from "@/lib/pay";
import { allocate, eligibleCandidates, type OpenSlot, type Pick } from "@/lib/planning/allocate";
import { hasConfirmedAvailability, type ShiftSlot } from "@/lib/planning/constraints";
import { loadPlanningContext } from "@/lib/planning/context";
import { roleLabel } from "@/lib/roles";
import { romeDayKey, romeHHMM } from "@/lib/time";

// Task (b): fill open slots. Code decides who is allowed; the model only chooses among allowed people
// and explains why. Every pick is re-checked before it is saved.

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

export type PlanOptions = {
  /** Only these shifts (default: every shift with open slots). */
  shiftIds?: number[];
  /** Re-plan after a decline: logged as plan.rebalanced with a short who-replaces-whom message. */
  rebalance?: { declinedWorkerId: number; declinedName: string };
};

export async function planJob(jobId: number, opts: PlanOptions = {}): Promise<PlanResult> {
  const job = await db().job.findUniqueOrThrow({
    where: { id: jobId },
    include: { shifts: { orderBy: { startsAt: "asc" }, include: { assignments: { select: { workerId: true, status: true } } } } },
  });
  const ctx = await loadPlanningContext(job.startsAt, job.endsAt);
  const rateOf = (id: number) => ctx.workers.find((w) => w.id === id)?.hourlyRateCents ?? 0;

  // Anyone with a row on a shift (proposed, sent, confirmed or declined) is never offered it again.
  const excluded = new Map(job.shifts.map((s) => [s.id, new Set(s.assignments.map((a) => a.workerId))]));
  const common = { workers: ctx.facts, bookings: ctx.bookings, minRestHours: ctx.minRestHours, dayKey: romeDayKey, excluded };

  const open: (OpenSlot & { shift: (typeof job.shifts)[number] })[] = job.shifts
    .filter((s) => !opts.shiftIds || opts.shiftIds.includes(s.id))
    .map((s) => ({
      shift: s,
      slot: { shiftId: s.id, role: s.role, start: s.startsAt.getTime(), end: s.endsAt.getTime() } as ShiftSlot,
      needed: s.headcount - s.assignments.filter((a) => a.status !== "DECLINED").length,
      minutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000) - s.breakMinutes,
    }))
    .filter((o) => o.needed > 0);

  if (open.length === 0) return { proposed: 0, unfilled: 0, summary: "Every slot already has someone. Nothing to plan." };

  // The model sees only people code already allows.
  const candidates = new Map(open.map((o) => [o.slot.shiftId, eligibleCandidates(o.slot, common)]));

  const prompt = {
    job: { title: job.title, site: job.site, budgetEur: job.budgetCents / 100 },
    situation: opts.rebalance
      ? `${opts.rebalance.declinedName} declined these shifts. Pick replacements; prefer one person who can cover all of them.`
      : "First plan for this job.",
    rules: {
      minRestHours: ctx.minRestHours,
      note: "Every listed candidate is already valid for that shift (role, availability, no overlap, rest). Shifts on the same day form one working day: the same person may work both the morning and the afternoon shift of a day, and that is preferred. The rest rule only applies between days. Code re-checks every pick.",
    },
    shifts: open.map((o) => ({
      shiftId: o.slot.shiftId,
      day: romeDayKey(o.shift.startsAt),
      time: `${romeHHMM(o.shift.startsAt)}-${romeHHMM(o.shift.endsAt)}`,
      role: roleLabel[o.shift.role],
      needed: o.needed,
      candidates: (candidates.get(o.slot.shiftId) ?? []).map((w) => ({
        workerId: w.id,
        name: w.name,
        reliability: w.reliability,
        hourlyRateEur: rateOf(w.id) / 100,
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
        "The summary describes the plan you are returning (who covers what, the trade-off). Never call the plan impossible or non-compliant: code reports any gaps separately.",
      ].join("\n"),
      user: JSON.stringify(prompt),
    });
    modelPlan = res.data;
    model = res.model;
  } catch (err) {
    // The deterministic fallback in allocate() still produces a valid plan; the log says the agent was unavailable.
    console.error("planJob: model call failed", err);
  }

  const picks = new Map((modelPlan?.shifts ?? []).map((s) => [s.shiftId, s.picks]));
  const { accepted, unfilled: gaps } = allocate(open, picks, { ...common, rateOf });
  const unfilled = gaps.reduce((n, g) => n + g.missing, 0);

  const dayOf = new Map(open.map((o) => [o.slot.shiftId, romeDayKey(o.shift.startsAt)]));
  const costCents = crewPayCents(
    accepted.map((a) => ({ workerId: a.workerId, day: dayOf.get(a.shiftId)!, minutes: a.plannedMinutes, hourlyRateCents: rateOf(a.workerId) })),
    ctx.rules,
  );
  const people = new Set(accepted.map((a) => a.workerId)).size;
  const totalSlots = open.reduce((n, o) => n + o.needed, 0);
  const gapNotes = [
    ...new Set(
      gaps.map((g) => {
        const o = open.find((x) => x.slot.shiftId === g.shiftId)!;
        return infeasibleReason(o.shift.role, o.shift.headcount, ctx.facts.filter((w) => w.role === o.shift.role).length, g.candidates, o.shift.startsAt);
      }),
    ),
  ].slice(0, 2);

  // Figures and names come from code; the model contributes only the "why".
  let summary: string;
  if (opts.rebalance) {
    const first = (name: string) => name.split(" ")[0];
    const who = [...new Set(accepted.map((a) => ctx.workers.find((w) => w.id === a.workerId)!.name))].map(first);
    const days = [...new Set(open.map((o) => formatDay(o.shift.startsAt)))].join(", ");
    const lead = `${first(opts.rebalance.declinedName)} declined ${days}.`;
    summary =
      unfilled > 0
        ? `${lead} ${gapNotes.join(" ")}${accepted.length ? ` Proposed ${who.join(", ")} for ${accepted.length} of ${totalSlots} slots.` : ""}`
        : `${lead} ${who.join(" and ")} ${who.length === 1 ? "takes" : "take"} over: ${accepted[0]?.reason ?? ""} Proposed, not sent.`;
  } else {
    const facts = `${accepted.length} assignments for ${people} ${people === 1 ? "person" : "people"}, planned ${formatEUR(costCents)}${job.budgetCents > 0 ? ` of ${formatEUR(job.budgetCents)} budget` : ""}.`;
    const why = modelPlan?.summary?.trim() || "Agent offline: ranked by availability and reliability.";
    summary = unfilled > 0 ? `${gapNotes.join(" ")} Filled ${accepted.length} of ${totalSlots} slots.` : `${why} ${facts}`;
  }

  await db().$transaction(async (tx) => {
    for (const a of accepted) {
      await tx.assignment.create({
        data: { shiftId: a.shiftId, workerId: a.workerId, status: "PROPOSED", plannedMinutes: a.plannedMinutes, reason: a.reason, token: token() },
      });
    }
    await logActivity(tx, {
      jobId,
      actor: "agent",
      type: opts.rebalance ? "plan.rebalanced" : "plan.proposed",
      message: summary,
      data: {
        model,
        agentAvailable: model !== null,
        proposed: accepted.length,
        people,
        unfilled,
        plannedCostCents: costCents,
        declinedWorkerId: opts.rebalance?.declinedWorkerId ?? null,
        picks: accepted.map((a) => ({ shiftId: a.shiftId, workerId: a.workerId, source: a.source })),
      },
    });
  });

  console.info(`planJob ${jobId}${opts.rebalance ? " (rebalance)" : ""}: ${accepted.length} proposed, ${unfilled} unfilled, agent ${model ? "used" : "offline"}`);
  return { proposed: accepted.length, unfilled, summary };
}
