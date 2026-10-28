import { db } from "@/lib/db";
import { refreshBatch } from "@/lib/payouts/service";
import { verifyWebhookSignature } from "@/lib/paypal/client";

// POST /api/paypal/webhook — PayPal Payouts events, signature verified with PayPal before anything is read.
// The event only says which batch moved; the batch is then re-fetched from PayPal and applied through the same
// applyBatchStatus as reconcile, so out-of-order or repeated deliveries can't put rows in a wrong state.

const BATCH_EVENTS = ["PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED", "PAYMENT.PAYOUTSBATCH.PROCESSING"];
const ITEM_EVENTS = ["SUCCEEDED", "FAILED", "BLOCKED", "UNCLAIMED", "RETURNED", "REFUNDED", "CANCELED"].map((s) => `PAYMENT.PAYOUTS-ITEM.${s}`);

type PayoutsEvent = {
  id?: string;
  event_type?: string;
  resource?: { payout_batch_id?: string; batch_header?: { payout_batch_id?: string } };
};

export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return Response.json({ error: "webhook not configured" }, { status: 503 });

  let event: PayoutsEvent;
  try {
    event = JSON.parse(await request.text()) as PayoutsEvent;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyWebhookSignature(request.headers, event, webhookId);
  } catch (err) {
    console.error("webhook verify", err instanceof Error ? err.message : err);
    return Response.json({ error: "verification unavailable" }, { status: 503 }); // PayPal retries
  }
  if (!verified) return Response.json({ error: "invalid signature" }, { status: 400 });

  const type = event.event_type ?? "";
  if (!BATCH_EVENTS.includes(type) && !ITEM_EVENTS.includes(type)) return Response.json({ ignored: type });

  const paypalBatchId = event.resource?.batch_header?.payout_batch_id ?? event.resource?.payout_batch_id;
  const batch = paypalBatchId ? await db().payoutBatch.findUnique({ where: { paypalBatchId }, select: { id: true, demo: true } }) : null;
  if (!batch || batch.demo) return Response.json({ ignored: "unknown batch" });

  const res = await refreshBatch(batch.id, "paypal");
  // A 5xx makes PayPal deliver again later; reconcile would catch up anyway.
  return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 503 });
}
