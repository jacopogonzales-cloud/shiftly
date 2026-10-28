import { timingSafeEqual } from "node:crypto";
import { reconcile } from "@/lib/payouts/service";

// POST /api/paypal/reconcile — header x-cron-secret: SHIFTLY_CRON_SECRET.
// Re-fetches every payout batch still in flight from PayPal (or one job's, or one batch) and applies it.
// Body (optional JSON): { "jobId": 4 } or { "batchId": 12 }.

function authorized(given: string | null): boolean {
  const secret = process.env.SHIFTLY_CRON_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-cron-secret"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown; batchId?: unknown };
  const id = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined);
  const results = await reconcile({ jobId: id(body.jobId), batchId: id(body.batchId) });
  return Response.json({ checked: results.length, results });
}
