// Seed: Fieramente Allestimenti (Milan). Wipes all tables, then recreates demo data relative to today.
// Run: npm run db:seed
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role, type Worker } from "../src/generated/prisma/client";
import { shiftPayCents } from "../src/lib/pay";
import { pgConfig } from "../src/lib/pg-config";

const prisma = new PrismaClient({ adapter: new PrismaPg(pgConfig(process.env.DATABASE_URL)) });

const TZ = "Europe/Rome";
const OVERTIME_AFTER = 480;
const OVERTIME_MULTIPLIER = 1.25;

const recipients = (process.env.SHIFTLY_PAYOUT_RECIPIENTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (recipients.length < 3) throw new Error("SHIFTLY_PAYOUT_RECIPIENTS must contain 3 sandbox emails");

// --- dates in Europe/Rome --------------------------------------------------

function romeOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Rome calendar day as {y, m, d}, shifted by `days`. */
function romeDay(days: number): { y: number; m: number; d: number } {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** Instant for a wall-clock time in Rome, `days` from today. */
function at(days: number, hhmm: string): Date {
  const { y, m, d } = romeDay(days);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - romeOffsetMinutes(guess) * 60_000);
}

/** UTC midnight of a Rome calendar day, for @db.Date columns. */
function dateOnly(days: number): Date {
  const { y, m, d } = romeDay(days);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Weekday offset (Mon = 0) of today in Rome. */
function romeWeekday(): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short);
}

const token = () => randomBytes(16).toString("base64url");
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

const payCents = (minutes: number, hourlyRateCents: number) =>
  shiftPayCents(minutes, hourlyRateCents, { overtimeAfterMinutes: OVERTIME_AFTER, overtimeMultiplier: OVERTIME_MULTIPLIER });

// --- data ------------------------------------------------------------------

const workers: { name: string; role: Role; rate: number; reliability: number; phone: string; notes?: string }[] = [
  { name: "Luca Bianchi", role: "MONTATORE", rate: 1800, reliability: 92, phone: "+39 347 512 8830", notes: "Crew lead on stand builds." },
  { name: "Giulia Rossi", role: "ELETTRICISTA", rate: 2400, reliability: 88, phone: "+39 333 204 7716", notes: "PES/PAV certified." },
  { name: "Marco Esposito", role: "RIGGER", rate: 2600, reliability: 85, phone: "+39 349 880 1452", notes: "IRATA level 2." },
  { name: "Francesca Romano", role: "MONTATORE", rate: 1700, reliability: 78, phone: "+39 340 117 6093" },
  { name: "Alessandro Colombo", role: "MONTATORE", rate: 1650, reliability: 64, phone: "+39 328 655 2401", notes: "Late twice in September." },
  { name: "Sara Ricci", role: "ELETTRICISTA", rate: 2300, reliability: 90, phone: "+39 345 902 3378" },
  { name: "Davide Marino", role: "RIGGER", rate: 2500, reliability: 81, phone: "+39 366 431 0957" },
  { name: "Chiara Greco", role: "AUTISTA", rate: 1600, reliability: 95, phone: "+39 338 776 1204", notes: "C+E licence, own tail-lift." },
  { name: "Matteo Bruno", role: "AUTISTA", rate: 1550, reliability: 72, phone: "+39 351 248 6610" },
  { name: "Elena Gallo", role: "MONTATORE", rate: 1750, reliability: 87, phone: "+39 342 309 5581" },
];

function emailFor(index: number, name: string): string {
  if (index < 3) return recipients[index];
  return `${name.toLowerCase().replace(" ", ".")}@example.com`;
}

async function main() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "ActivityLog", "PayoutItem", "PayoutBatch", "Assignment", "Availability", "Shift", "Job", "Worker", "Settings" RESTART IDENTITY CASCADE`,
  );

  await prisma.settings.create({
    data: { id: 1, companyName: "Fieramente Allestimenti", overtimeAfterMinutes: OVERTIME_AFTER, overtimeMultiplier: OVERTIME_MULTIPLIER, minRestHours: 11 },
  });

  const crew: Worker[] = [];
  for (const [i, w] of workers.entries()) {
    crew.push(
      await prisma.worker.create({
        data: { name: w.name, role: w.role, hourlyRateCents: w.rate, paypalEmail: emailFor(i, w.name), phone: w.phone, reliability: w.reliability, notes: w.notes },
      }),
    );
  }
  const byName = (first: string) => crew.find((w) => w.name.startsWith(first))!;

  // Availability for the next 21 days, with a deterministic sprinkle of days off.
  await prisma.availability.createMany({
    data: crew.flatMap((w, wi) =>
      Array.from({ length: 21 }, (_, day) => ({ workerId: w.id, date: dateOnly(day), available: (wi * 7 + day * 3) % 11 !== 0 })),
    ),
  });

  await seedPaidJob(byName);
  await seedInProgressJob(byName);

  console.log(`Seeded: 1 company, ${crew.length} workers, 2 jobs.`);
}

type ByName = (first: string) => { id: number; name: string; hourlyRateCents: number };

async function seedPaidJob(byName: ByName) {
  // Two days, five weeks ago, Tue/Wed.
  const base = -35 - romeWeekday() + 1;
  const job = await prisma.job.create({
    data: {
      title: "Allestimento convention autunnale",
      client: "Studio Vela Eventi",
      site: "Via Tortona 27, Milano",
      startsAt: at(base, "07:30"),
      endsAt: at(base + 1, "14:00"),
      status: "PAID",
      budgetCents: 140_000,
      requirementsText:
        "Convention for 400 people at Via Tortona. Day 1 build: 3 montatori and 1 elettricista from 07:30 to 17:30. Day 2 rigging and finishing: 1 rigger and 2 montatori 08:00–14:00.",
      requirements: {
        shifts: [
          { day: 1, start: "07:30", end: "17:30", role: "MONTATORE", headcount: 3 },
          { day: 1, start: "07:30", end: "17:30", role: "ELETTRICISTA", headcount: 1 },
          { day: 2, start: "08:00", end: "14:00", role: "RIGGER", headcount: 1 },
          { day: 2, start: "08:00", end: "14:00", role: "MONTATORE", headcount: 2 },
        ],
      },
    },
  });

  const plan: { day: number; start: string; end: string; role: Role; crew: { name: string; actual?: number; reason: string }[] }[] = [
    { day: 0, start: "07:30", end: "17:30", role: "MONTATORE", crew: [
      { name: "Luca", reason: "Most reliable montatore available, leads the build." },
      { name: "Francesca", actual: 630, reason: "Available both days, rate within budget." },
      { name: "Elena", reason: "High reliability, free on day 1." },
    ] },
    { day: 0, start: "07:30", end: "17:30", role: "ELETTRICISTA", crew: [
      { name: "Giulia", reason: "Certified for temporary power distribution." },
    ] },
    { day: 1, start: "08:00", end: "14:00", role: "RIGGER", crew: [
      { name: "Marco", reason: "Only rigger with truss experience free on day 2." },
    ] },
    { day: 1, start: "08:00", end: "14:00", role: "MONTATORE", crew: [
      { name: "Luca", reason: "Continuity with day-1 build, 14h rest respected." },
      { name: "Alessandro", actual: 330, reason: "Lowest rate among free montatori." },
    ] },
  ];

  const totals = new Map<number, number>();
  for (const s of plan) {
    const startsAt = at(base + s.day, s.start);
    const endsAt = at(base + s.day, s.end);
    const planned = minutesBetween(startsAt, endsAt);
    await prisma.shift.create({
      data: {
        jobId: job.id, startsAt, endsAt, role: s.role, headcount: s.crew.length,
        assignments: {
          create: s.crew.map((c) => {
            const w = byName(c.name);
            const actual = c.actual ?? planned;
            totals.set(w.id, (totals.get(w.id) ?? 0) + payCents(actual, w.hourlyRateCents));
            return { workerId: w.id, status: "CONFIRMED" as const, plannedMinutes: planned, actualMinutes: actual, reason: c.reason, token: token() };
          }),
        },
      },
    });
  }

  const totalCents = [...totals.values()].reduce((a, b) => a + b, 0);
  const paidAt = at(base + 1, "18:40");
  const senderBatchId = `job-${job.id}-1`;
  const itemIds = ["3HZ8QK2WJ7N4L", "7RT5MX9C2PB6D", "9VK3LS6F8QW2A", "2NB7DY4H5TJ9C", "5QW2EJ8R3LM6K", "8FC6PA2Z9XV4H"];
  await prisma.payoutBatch.create({
    data: {
      jobId: job.id,
      senderBatchId,
      paypalBatchId: "6LXJ2QW9R4MNA",
      status: "SUCCESS",
      totalCents,
      createdBy: "operator",
      demo: true,
      approvedAt: paidAt,
      createdAt: paidAt,
      items: {
        create: [...totals.entries()].map(([workerId, amountCents], i) => ({
          workerId, amountCents, senderItemId: `job-${job.id}-worker-${workerId}-1`, paypalItemId: itemIds[i], status: "SUCCESS", createdAt: paidAt,
        })),
      },
    },
  });

  const log = (actor: "operator" | "agent" | "paypal", type: string, message: string, when: Date, data?: object) =>
    ({ jobId: job.id, actor, type, message, createdAt: when, data: { seed: true, ...data } });
  const d0 = (days: number, hhmm: string) => at(base + days, hhmm);
  await prisma.activityLog.createMany({
    data: [
      log("operator", "job.created", "Job created from client brief.", d0(-6, "10:12")),
      log("agent", "requirements.extracted", "Extracted 4 shift lines across 2 days from the brief.", d0(-6, "10:12")),
      log("agent", "plan.proposed", "Proposed 7 assignments for 6 people; all hard constraints met.", d0(-6, "10:14")),
      log("operator", "requests.sent", "Sent 7 availability requests.", d0(-6, "10:20")),
      log("operator", "crew.confirmed", "All 7 assignments confirmed. Crew locked.", d0(-5, "16:02")),
      log("operator", "job.started", "Job started.", d0(0, "07:25")),
      log("agent", "hours.reconciled", "2 deltas over 15 min: Francesca +30 min (day 1), Alessandro −30 min (day 2).", d0(1, "14:30")),
      log("operator", "hours.confirmed", "Hours sheet confirmed.", d0(1, "18:35")),
      log("operator", "payout.approved", `Approved payout batch ${senderBatchId} for 6 people.`, paidAt, { totalCents }),
      log("paypal", "payout.batch.success", "PayPal batch 6LXJ2QW9R4MNA completed: 6/6 items SUCCESS.", new Date(paidAt.getTime() + 41_000)),
      log("agent", "job.paid", "Everyone paid. Job closed.", new Date(paidAt.getTime() + 42_000)),
    ],
  });
}

async function seedInProgressJob(byName: ByName) {
  // Four days starting yesterday: rigging, build, power, load-out.
  const job = await prisma.job.create({
    data: {
      title: "Montaggio palco concerto",
      client: "Arcadia Live",
      site: "Arena Civica, Viale Byron 2, Milano",
      startsAt: at(-1, "07:00"),
      endsAt: at(2, "22:00"),
      status: "IN_PROGRESS",
      budgetCents: 380_000,
      requirementsText:
        "Outdoor stage for an evening concert. Day 1 rigging 07:00–15:00 (2 riggers, 2 montatori). Day 2 build and power 08:00–18:00 (2 elettricisti, 2 montatori). Day 3 transport 09:00–17:00 (2 autisti). Day 4 load-out 14:00–22:00 (3 montatori, 1 autista).",
    },
  });

  const plan: { day: number; start: string; end: string; role: Role; crew: string[] }[] = [
    { day: -1, start: "07:00", end: "15:00", role: "RIGGER", crew: ["Marco", "Davide"] },
    { day: -1, start: "07:00", end: "15:00", role: "MONTATORE", crew: ["Luca", "Elena"] },
    { day: 0, start: "08:00", end: "18:00", role: "ELETTRICISTA", crew: ["Giulia", "Sara"] },
    { day: 0, start: "08:00", end: "18:00", role: "MONTATORE", crew: ["Luca", "Francesca"] },
    { day: 1, start: "09:00", end: "17:00", role: "AUTISTA", crew: ["Chiara", "Matteo"] },
    { day: 2, start: "14:00", end: "22:00", role: "MONTATORE", crew: ["Elena", "Francesca", "Alessandro"] },
    { day: 2, start: "14:00", end: "22:00", role: "AUTISTA", crew: ["Chiara"] },
  ];

  let count = 0;
  for (const s of plan) {
    const startsAt = at(s.day, s.start);
    const endsAt = at(s.day, s.end);
    const planned = minutesBetween(startsAt, endsAt);
    count += s.crew.length;
    await prisma.shift.create({
      data: {
        jobId: job.id, startsAt, endsAt, role: s.role, headcount: s.crew.length,
        assignments: {
          create: s.crew.map((name) => ({
            workerId: byName(name).id, status: "CONFIRMED" as const, plannedMinutes: planned, reason: "Matches role, available, rest window respected.", token: token(),
          })),
        },
      },
    });
  }

  const log = (actor: "operator" | "agent", type: string, message: string, when: Date) =>
    ({ jobId: job.id, actor, type, message, createdAt: when, data: { seed: true } });
  await prisma.activityLog.createMany({
    data: [
      log("operator", "job.created", "Job created from client brief.", at(-8, "09:40")),
      log("agent", "plan.proposed", `Proposed ${count} assignments for 9 people; all hard constraints met.`, at(-8, "09:43")),
      log("operator", "requests.sent", `Sent ${count} availability requests.`, at(-8, "09:50")),
      log("agent", "plan.rebalanced", "Alessandro declined day 1. Elena takes the montatore slot: free, reliability 87.", at(-7, "11:05")),
      log("operator", "crew.confirmed", `All ${count} assignments confirmed. Crew locked.`, at(-6, "18:20")),
      log("operator", "job.started", "Job started.", at(-1, "06:55")),
    ],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
