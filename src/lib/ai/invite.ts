import "server-only";
import { structured } from "@/lib/ai/openai";

// Task (c): short availability requests, one per person. English, no pay figures, no claims that anyone agreed.

export type InviteInput = { workerId: number; firstName: string; role: string; days: string[] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["messages"],
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["workerId", "message"],
        properties: { workerId: { type: "integer" }, message: { type: "string", description: "Two short sentences, max 220 characters." } },
      },
    },
  },
};

function fallback(p: InviteInput, company: string, title: string): string {
  return `Hi ${p.firstName}, ${company} would like you as ${p.role.toLowerCase()} on ${title} (${p.days.join(", ")}). Please accept or decline below.`;
}

export async function writeInvitations(company: string, job: { title: string; site: string }, people: InviteInput[]): Promise<Map<number, string>> {
  const out = new Map(people.map((p) => [p.workerId, fallback(p, company, job.title)]));
  try {
    const { data } = await structured<{ messages: { workerId: number; message: string }[] }>({
      name: "availability_requests",
      schema,
      system: [
        `You write availability requests from ${company}, an event-crew company in Milan, to freelancers.`,
        "One message per person: two short sentences in English, friendly and plain. Greet by first name, name the role, the dates and the venue.",
        "Never mention pay or amounts. Never say they already agreed. No emojis, no exclamation marks.",
      ].join("\n"),
      user: JSON.stringify({ job, people }),
    });
    for (const m of data.messages) if (out.has(m.workerId) && m.message.trim()) out.set(m.workerId, m.message.trim().slice(0, 400));
  } catch (err) {
    console.error("writeInvitations: model call failed, using template", err);
  }
  return out;
}
