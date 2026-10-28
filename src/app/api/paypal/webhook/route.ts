import { db } from "@/lib/db";
import { refreshBatch } from "@/lib/payouts/service";
import { verifyWebhookSignature } from "@/lib/paypal/client";

// POST /api/paypal/webhook — PayPal Payouts events, signature verified with PayPal before anything is read.
// The event only says which batch moved; the batch is then re-fetched from PayPal and applied through the same
// applyBatchStatus as reconcile, so out-of-order or repeated deliveries can't put rows in a wrong state.

const BATCH_EVENTS = ["PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED", "PAYMENT.PAYOUTSBATCH.PROCESSING"];
const ITEM_EVENTS = ["SUCCEEDED", "FAILED", "BLOCKED", "UNCLAIMED", "RETURNED", "REFUNDED", "CANCELED"].map((s) => `PAYMENT.PAYOUTS-ITEM.${s}`);

/** One line per delivery for the server log: event type, ids and outcome only, never headers, body or secrets. */
function logDelivery(f: { event?: string; id?: string; batch?: string; signature: "verified" | "invalid" | "unavailable" | "not-checked"; result: string }) {
  console.info(`[paypal-webhook] event=${f.event ?? "-"} id=${f.id ?? "-"} batch=${f.batch ?? "-"} signature=${f.signature} result=${f.result}`);
}

type PayoutsEvent = {
  id?: string;
  event_type?: string;
  resource?: { payout_batch_id?: string; batch_header?: { payout_batch_id?: string } };
};

export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    logDelivery({ signature: "not-checked", result: "503 PAYPAL_WEBHOOK_ID not set" });
    return Response.json({ error: "webhook not configured" }, { status: 503 });
  }

  let event: PayoutsEvent;
  try {
    event = JSON.parse(await request.text()) as PayoutsEvent;
  } catch {
    logDelivery({ signature: "not-checked", result: "400 invalid body" });
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const type = event.event_type ?? "";
  const paypalBatchId = event.resource?.batch_header?.payout_batch_id ?? event.resource?.payout_batch_id;
  const base = { event: type || undefined, id: event.id, batch: paypalBatchId };

  let verified = false;
  try {
    verified = await verifyWebhookSignature(request.headers, event, webhookId);
  } catch (err) {
    console.error("webhook verify", err instanceof Error ? err.message : err);
    logDelivery({ ...base, signature: "unavailable", result: "503 retry later" });
    return Response.json({ error: "verification unavailable" }, { status: 503 }); // PayPal retries
  }
  if (!verified) {
    logDelivery({ ...base, signature: "invalid", result: "400 rejected" });
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!BATCH_EVENTS.includes(type) && !ITEM_EVENTS.includes(type)) {
    logDelivery({ ...base, signature: "verified", result: "200 ignored event type" });
    return Response.json({ ignored: type });
  }

  const batch = paypalBatchId ? await db().payoutBatch.findUnique({ where: { paypalBatchId }, select: { id: true, demo: true } }) : null;
  if (!batch || batch.demo) {
    logDelivery({ ...base, signature: "verified", result: "200 unknown batch" });
    return Response.json({ ignored: "unknown batch" });
  }

  const res = await refreshBatch(batch.id, "paypal");
  logDelivery({ ...base, signature: "verified", result: res.ok ? "200 applied" : "503 refresh failed" });
  // A 5xx makes PayPal deliver again later; reconcile would catch up anyway.
  return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 503 });
}
