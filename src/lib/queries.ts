import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { TIME_ZONE } from "@/lib/format";
import { crewPayCents, DEFAULT_PAY_RULES, type PayRules } from "@/lib/pay";

// Read-side queries for the shell. Each one waits for a request so nothing touches the DB at build time.

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export async function getSettings() {
  await connection();
  return db().settings.findUnique({ where: { id: 1 } });
}

/** For the shell: never throws, so a DB outage can't take down the root layout. */
export async function getCompanyName(): Promise<string | null> {
  await connection();
  try {
    const settings = await db().settings.findUnique({ where: { id: 1 }, select: { companyName: true } });
    return settings?.companyName ?? null;
  } catch {
    return null;
  }
}

async function payRules(): Promise<PayRules> {
  const settings = await db().settings.findUnique({ where: { id: 1 } });
  return settings ?? DEFAULT_PAY_RULES;
}

export async function getJobs() {
  await connection();
  const [jobs, rules] = await Promise.all([
    db().job.findMany({
      orderBy: { startsAt: "desc" },
      include: {
        shifts: {
          select: {
            headcount: true,
            startsAt: true,
            assignments: { select: { status: true, workerId: true, plannedMinutes: true, worker: { select: { hourlyRateCents: true } } } },
          },
        },
        payoutBatches: { select: { items: { select: { status: true, amountCents: true } } } },
      },
    }),
    payRules(),
  ]);

  return jobs.map((job) => {
    const assignments = job.shifts.flatMap((s) => s.assignments.map((a) => ({ ...a, day: dayKey.format(s.startsAt) })));
    const live = assignments.filter((a) => a.status !== "DECLINED");
    const plannedCents = crewPayCents(
      live.map((a) => ({ workerId: a.workerId, day: a.day, minutes: a.plannedMinutes, hourlyRateCents: a.worker.hourlyRateCents })),
      rules,
    );
    const paidCents = job.payoutBatches.flatMap((b) => b.items).filter((i) => i.status === "SUCCESS").reduce((n, i) => n + i.amountCents, 0);
    return {
      ...job,
      needed: job.shifts.reduce((n, s) => n + s.headcount, 0),
      confirmed: assignments.filter((a) => a.status === "CONFIRMED").length,
      assigned: live.length,
      declined: assignments.length - live.length,
      // Paid jobs show what actually reached people; everything else shows planned labour cost.
      forecastCents: job.status === "PAID" ? paidCents : plannedCents,
    };
  });
}

export async function getCrew() {
  await connection();
  const now = Date.now();
  const today = dayKey.format(now);
  const workers = await db().worker.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      availability: { where: { date: new Date(`${today}T00:00:00Z`) }, select: { available: true } },
      assignments: {
        where: { status: { in: ["SENT", "CONFIRMED"] } },
        select: { status: true, shift: { select: { jobId: true, startsAt: true, endsAt: true } } },
      },
    },
  });

  return workers.map((w) => {
    const onJobToday = w.assignments.some((a) => a.status === "CONFIRMED" && dayKey.format(a.shift.startsAt) === today);
    const todayRow = w.availability[0];
    const availability: "on-job" | "available" | "unavailable" | "unknown" = onJobToday
      ? "on-job"
      : todayRow === undefined
        ? "unknown"
        : todayRow.available
          ? "available"
          : "unavailable";
    return {
      ...w,
      availability,
      jobCount: new Set(w.assignments.filter((a) => a.status === "CONFIRMED").map((a) => a.shift.jobId)).size,
    };
  });
}

export async function getPayoutBatches() {
  await connection();
  return db().payoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { id: true, title: true, client: true } },
      items: { orderBy: { id: "asc" }, include: { worker: { select: { name: true, role: true, paypalEmail: true } } } },
    },
  });
}

export async function getRoleRates() {
  await connection();
  const groups = await db().worker.groupBy({
    by: ["role"],
    _min: { hourlyRateCents: true },
    _max: { hourlyRateCents: true },
    _count: { _all: true },
    orderBy: { role: "asc" },
  });
  return groups.map((g) => ({ role: g.role, min: g._min.hourlyRateCents ?? 0, max: g._max.hourlyRateCents ?? 0, count: g._count._all }));
}

export async function paypalCredentialsConfigured(): Promise<boolean> {
  await connection();
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}
