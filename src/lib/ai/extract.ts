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

const DEFAULT_SPLIT = [
  { start: "08:00", end: "12:30" },
  { start: "13:30", end: "18:00" },
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function extractJob(brief: string): Promise<{ job: ExtractedJob; model: string }> {
  const today = romeDayKey(new Date());
  const { data, model } = await structured<ExtractedJob>({
    name: "job_requirements",
    schema,
    system: [
      "You turn an event-crew operator's job brief into a complete, editable shift draft.",
      `Today is ${today} (Europe/Rome). Resolve dates without a year to the next future occurrence and add an assumption.`,
      "",
      "LANGUAGE: write title, notes, assumptions and missing in English, even when the brief is in Italian or another language.",
      "Keep proper nouns exactly as written: people, company and client names, venue names (e.g. Fiera Milano Rho), street addresses, cities (Milano).",
      "Translate descriptive words around them: padiglione → hall, ingresso → gate, stand stays stand.",
      "",
      "FIELDS:",
      "- client: the company the work is for. Phrases like 'for Orbis Expo', 'per Orbis Expo', 'client: X', 'on behalf of X' all name the client. Empty only if no company is named.",
      "- site: venue plus hall/stand/gate/address details, as written (e.g. 'Fiera Milano Rho, hall 7').",
      "- title: short English job description without the client name, e.g. 'Trade fair stand build'.",
      "",
      "ALWAYS RETURN A COMPLETE SHIFTS DRAFT. One entry per date × time window × role. When the brief leaves something out, use these defaults and add one 'Assumed: …' line for each default you used:",
      "- No times given: two shifts per day, 08:00–12:30 and 13:30–18:00 (the hour between is the unpaid break, so breakMinutes = 0 on each). Assumption: 'Assumed: two shifts, 08:00–12:30 and 13:30–18:00, with a 60-minute unpaid break.'",
      "- One time window with a stated break (e.g. 08:00–17:00 with a one-hour break): one shift with breakMinutes = 60.",
      "- One time window longer than 6 hours and no break mentioned: breakMinutes = 60, with an assumption.",
      "- Total people given without a role split: 1 electrician if electrical/power/lighting work or an electrician is mentioned, the rest installers. Assumption naming the split.",
      "- No roles at all: everyone is an installer. Assumption.",
      "- People given for a day (e.g. '6 people on the 21st'): every shift of that day needs that many; the same people can work both shifts of a day. Add an assumption.",
      "- A total spread over several days without per-day numbers: split it evenly across the days (round up), then apply the rule above. Add an assumption.",
      "- 'Each shift' / 'per shift' headcounts apply to every shift line of every day.",
      "Roles: installer/montatore/builder/stagehand/crew → MONTATORE; electrician/elettricista → ELETTRICISTA; rigger → RIGGER; driver/autista/van → AUTISTA.",
      "Qualifiers like 'certified electrician' stay ELETTRICISTA; put the qualifier in notes.",
      "In any text (title, notes, assumptions, missing) say installer, electrician, rigger, driver; never the codes MONTATORE, ELETTRICISTA, RIGGER, AUTISTA.",
      "",
      "missing: only things that cannot be defaulted, e.g. no dates at all, no location, or a role outside the four above. One short sentence each, starting with 'Missing:'.",
      "assumptions: one short sentence each, starting with 'Assumed:'.",
    ].join("\n"),
    user: brief,
  });
  return { job: normalize(data), model };
}

/** Code-side guarantees on top of the prompt: valid times, sane headcounts and breaks, English chip prefixes. */
const ROLE_WORDS: [RegExp, string][] = [
  [/\bMONTATOR[EI]\b/gi, "installer"],
  [/\bELETTRICIST[AI]\b/gi, "electrician"],
  [/\bAUTIST[AI]\b/gi, "driver"],
  [/\bRIGGERS?\b/g, "rigger"],
];
const english = (text: string) => ROLE_WORDS.reduce((t, [re, word]) => t.replace(re, word), text);

function normalize(job: ExtractedJob): ExtractedJob {
  const assumptions = job.assumptions.map(english).map((a) => (a.startsWith("Assumed") ? a : `Assumed: ${a}`));
  const missing = job.missing.map(english).map((m) => (m.startsWith("Missing") ? m : `Missing: ${m}`));
  let defaultedTimes = false;

  const shifts: ExtractedShift[] = [];
  for (const s of job.shifts) {
    const headcount = Math.max(1, Math.round(s.headcount || 1));
    const breakMinutes = Math.max(0, Math.round(s.breakMinutes || 0));
    if (TIME.test(s.start) && TIME.test(s.end)) {
      shifts.push({ ...s, notes: english(s.notes), headcount, breakMinutes });
    } else {
      defaultedTimes = true;
      for (const w of DEFAULT_SPLIT) shifts.push({ ...s, ...w, notes: english(s.notes), headcount, breakMinutes: 0 });
    }
  }
  if (defaultedTimes && !assumptions.some((a) => a.includes("08:00–12:30"))) {
    assumptions.push("Assumed: two shifts, 08:00–12:30 and 13:30–18:00, with a 60-minute unpaid break.");
  }
  if (shifts.some((s) => !DATE.test(s.date)) && !missing.some((m) => /date/i.test(m))) {
    missing.push("Missing: the job dates.");
  }
  if (shifts.length === 0 && !missing.length) missing.push("Missing: dates, so no shifts could be drafted.");

  shifts.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.role.localeCompare(b.role));
  return { ...job, title: english(job.title), client: job.client.trim(), shifts, assumptions, missing };
}
