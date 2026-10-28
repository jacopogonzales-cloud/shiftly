import "server-only";

// PayPal REST, sandbox only. The host is hard-coded on purpose: this app must never be able to touch live money.
// Payouts isn't covered by @paypal/paypal-server-sdk (the APIMatic context plugin documents Orders), so this is plain fetch.
export const PAYPAL_API = "https://api-m.sandbox.paypal.com";

const TIMEOUT_MS = 20_000;

/** PayPal answered with an error. `refused` means the request was definitely not carried out. */
export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly debugId: string | null,
  ) {
    super(message);
  }
  get refused(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 409 && this.status !== 429;
  }
}

/** No usable answer (network, timeout, 5xx): the request may or may not have been carried out. */
export class PayPalUnknownError extends Error {}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!id || !secret) throw new PayPalError(401, "NOT_CONFIGURED", "PayPal sandbox credentials are not set.", null);
  const res = await send("/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${PAYPAL_API}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    throw new PayPalUnknownError(`No answer from PayPal (${err instanceof Error ? err.name : "network"}).`);
  }
  if (res.ok) return res;
  const debugId = res.headers.get("paypal-debug-id");
  if (res.status >= 500) throw new PayPalUnknownError(`PayPal returned HTTP ${res.status}${debugId ? ` (debug id ${debugId})` : ""}.`);
  const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string; error?: string; error_description?: string; details?: { issue?: string; description?: string }[] };
  const detail = body.details?.[0];
  const message = [body.message ?? body.error_description ?? `HTTP ${res.status}`, detail?.issue ?? detail?.description].filter(Boolean).join(": ");
  throw new PayPalError(res.status, body.name ?? body.error ?? "ERROR", message, debugId);
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; requestId?: string }): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  const res = await send(path, { method: init.method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  return (await res.json()) as T;
}

// --- Payouts ------------------------------------------------------------------------

export type PayoutsItem = {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status: string;
  payout_item: { sender_item_id: string; receiver: string; amount: { value: string; currency: string } };
  errors?: { name?: string; message?: string };
};
export type PayoutsBatch = {
  batch_header: { payout_batch_id: string; batch_status: string; sender_batch_header: { sender_batch_id: string } };
  items?: PayoutsItem[];
};

export type NewPayout = {
  senderBatchId: string;
  emailSubject: string;
  emailMessage: string;
  items: { senderItemId: string; receiver: string; amountCents: number; note: string }[];
};

const euros = (cents: number) => (cents / 100).toFixed(2);

/** POST /v1/payments/payouts. PayPal-Request-Id = senderBatchId, so sending the same batch again returns the first answer. */
export function createPayout(p: NewPayout) {
  return call<PayoutsBatch>("/v1/payments/payouts", {
    method: "POST",
    requestId: p.senderBatchId,
    body: {
      sender_batch_header: { sender_batch_id: p.senderBatchId, email_subject: p.emailSubject, email_message: p.emailMessage },
      items: p.items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.receiver,
        amount: { value: euros(i.amountCents), currency: "EUR" },
        note: i.note,
        sender_item_id: i.senderItemId,
      })),
    },
  });
}

export function getPayout(paypalBatchId: string) {
  return call<PayoutsBatch>(`/v1/payments/payouts/${encodeURIComponent(paypalBatchId)}?page_size=1000`, { method: "GET" });
}

// --- Webhooks -----------------------------------------------------------------------

/** POST /v1/notifications/verify-webhook-signature. True only when PayPal answers SUCCESS. */
export async function verifyWebhookSignature(headers: Headers, event: unknown, webhookId: string): Promise<boolean> {
  const h = (name: string) => headers.get(name) ?? "";
  const res = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === "SUCCESS";
}
