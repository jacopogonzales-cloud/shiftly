import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { structured } from "@/lib/ai/openai";
import { romeDayKey } from "@/lib/time";

// Task (a): free-text brief → structured job requirements.

export type ExtractedShift = { date: string; start: string; end: string; breakMinutes: number; role: Role; headcount: number; notes: string };

export type ExtractedJob = {
  title: string;
  client: string;
  site: string;
  budgetEur: number | null;
  shifts: ExtractedShift[];
  assumptions: string[];
  missing: string[];
};

const ROLES: Role[] = ["MONTATORE", "ELETTRICISTA", "RIGGER", "AUTISTA"];

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "client", "site", "budgetEur", "shifts", "assumptions", "missing"],
  properties: {
    title: { type: "string", description: "Short job title, e.g. 'Stand build'. Italian venue/client names kept as written." },
    client: { type: "string", description: "Client company. Empty string if not stated." },
    site: { type: "string", description: "Venue and address as stated. Empty string if not stated." },
    budgetEur: { type: ["number", "null"], description: "Crew budget in euros if stated, else null." },
    shifts: {
      type: "array",
      description: "One entry per day × role. Split multi-day ranges into one entry per day.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "start", "end", "breakMinutes", "role", "headcount", "notes"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          start: { type: "string", description: "HH:MM, 24h" },
          end: { type: "string", description: "HH:MM, 24h" },
          breakMinutes: { type: "integer", description: "Unpaid break inside the shift, in minutes. 0 if none stated." },
          role: {
            type: "string",
            enum: ROLES,
            description: "MONTATORE = installer/builder/stagehand, ELETTRICISTA = electrician, RIGGER = rigger, AUTISTA = driver",
          },
          headcount: { type: "integer", description: "At least 1" },
          notes: { type: "string", description: "Short task note for the crew. Empty string if none." },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" }, description: "Each guess you made, e.g. 'Assumed: year 2026'." },
    missing: { type: "array", items: { type: "string" }, description: "Information needed but not in the brief." },
  },
};

export async function extractJob(brief: string): Promise<{ job: ExtractedJob; model: string }> {
  const today = romeDayKey(new Date());
  const { data, model } = await structured<ExtractedJob>({
    name: "job_requirements",
    schema,
    system: [
      "You turn an event-crew operator's job brief into structured shift requirements.",
      `Today is ${today} (Europe/Rome). Resolve dates without a year to the next future occurrence.`,
      "Only extract what the brief says. When you must guess (year, end time, a role mapping), add a line to assumptions.",
      "Roles: installer/montatore/builder/stagehand → MONTATORE; electrician/elettricista → ELETTRICISTA; rigger → RIGGER; driver/autista/van → AUTISTA. Roles outside these four go into missing.",
      "If the brief gives one time window for several days, repeat it on each day. Write assumptions and missing items in English, one short sentence each.",
    ].join("\n"),
    user: brief,
  });
  return { job: data, model };
}
