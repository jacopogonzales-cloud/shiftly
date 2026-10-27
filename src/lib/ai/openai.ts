import "server-only";

// Structured JSON calls to OpenAI Chat Completions. The model list comes from OPENAI_MODELS
// (comma-separated, first = preferred); later entries are used only if a model is unavailable.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

export class AIError extends Error {}

function models(): string[] {
  const list = (process.env.OPENAI_MODELS ?? "").split(/[,\s]+/).filter(Boolean);
  if (list.length === 0) throw new AIError("OPENAI_MODELS is not set");
  return list;
}

export type JsonSchema = Record<string, unknown>;

export async function structured<T>({
  name,
  schema,
  system,
  user,
}: {
  name: string;
  schema: JsonSchema;
  system: string;
  user: string;
}): Promise<{ data: T; model: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AIError("OPENAI_API_KEY is not set");

  let lastError = "";
  for (const model of models()) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = `OpenAI ${res.status}: ${body.slice(0, 300)}`;
      // Only fall through to the next model when this one can't be used at all.
      if (res.status === 404 || (res.status === 400 && /model/i.test(body))) continue;
      throw new AIError(lastError);
    }

    const json = (await res.json()) as { choices: { message: { content: string | null; refusal?: string | null } }[] };
    const message = json.choices[0]?.message;
    if (message?.refusal) throw new AIError(`Model refused: ${message.refusal}`);
    if (!message?.content) throw new AIError("Model returned no content");
    return { data: JSON.parse(message.content) as T, model };
  }
  throw new AIError(lastError || "No usable OpenAI model");
}
