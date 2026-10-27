// Milestone 0 — Payouts gate.
// Sends 3 × €1.00 sandbox payouts and polls the batch until it settles (max 60 s).
// Run: npx tsx --env-file=.env.local scripts/payouts-smoke.ts

// Hard-coded sandbox host: this script must never be able to touch live money.
const PAYPAL_API = "https://api-m.sandbox.paypal.com";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;
const TERMINAL_ITEM_STATES = new Set(["FAILED", "UNCLAIMED", "RETURNED"]);
const TERMINAL_BATCH_STATES = new Set(["SUCCESS", "DENIED", "CANCELED"]);

type PayoutItem = {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status: string;
  payout_item_fee?: { value: string; currency: string };
  payout_item: {
    receiver: string;
    sender_item_id: string;
    amount: { value: string; currency: string };
  };
  errors?: { name: string; message: string };
};

type PayoutBatch = {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    time_created?: string;
    time_completed?: string;
    sender_batch_header: { sender_batch_id: string };
    amount?: { value: string; currency: string };
    fees?: { value: string; currency: string };
  };
  items?: PayoutItem[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return value;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain ?? "?"}`;
}

async function failOnError(res: Response, step: string): Promise<never> {
  const body = await res.text();
  console.error(`\n✗ ${step} failed: HTTP ${res.status} ${res.statusText}`);
  console.error(`  paypal-debug-id: ${res.headers.get("paypal-debug-id") ?? "-"}`);
  console.error(`  body: ${body}`);
  process.exit(1);
}

async function getAccessToken(): Promise<string> {
  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const secret = requireEnv("PAYPAL_SECRET");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) await failOnError(res, "OAuth token");
  const data = (await res.json()) as { access_token: string; scope?: string };
  const hasPayoutsScope = data.scope?.includes("/payouts") ?? false;
  console.log(`✓ OAuth token obtained (payouts scope in token: ${hasPayoutsScope ? "yes" : "no"})`);
  return data.access_token;
}

async function createBatch(token: string, recipients: string[]): Promise<string> {
  const senderBatchId = `smoke-${Date.now()}`;
  const body = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: "Shiftly smoke test payout",
      email_message: "Sandbox smoke test from Shiftly.",
    },
    items: recipients.map((receiver, i) => ({
      recipient_type: "EMAIL",
      amount: { value: "1.00", currency: "EUR" },
      note: "Shiftly sandbox smoke test",
      sender_item_id: `${senderBatchId}-item-${i + 1}`,
      receiver,
    })),
  };

  const res = await fetch(`${PAYPAL_API}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": senderBatchId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await failOnError(res, "Create payout batch");
  const data = (await res.json()) as PayoutBatch;
  console.log(`✓ Batch created`);
  console.log(`  sender_batch_id: ${senderBatchId}`);
  console.log(`  payout_batch_id: ${data.batch_header.payout_batch_id}`);
  console.log(`  batch_status:    ${data.batch_header.batch_status}`);
  return data.batch_header.payout_batch_id;
}

async function getBatch(token: string, batchId: string): Promise<PayoutBatch> {
  const res = await fetch(`${PAYPAL_API}/v1/payments/payouts/${batchId}?fields=batch_header,items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await failOnError(res, "Get payout batch");
  return (await res.json()) as PayoutBatch;
}

function printBatch(batch: PayoutBatch, elapsedMs: number): void {
  const h = batch.batch_header;
  console.log(`\n[t+${(elapsedMs / 1000).toFixed(0)}s] batch ${h.payout_batch_id} → ${h.batch_status}`);
  for (const item of batch.items ?? []) {
    const p = item.payout_item;
    const err = item.errors ? `  error: ${item.errors.name} — ${item.errors.message}` : "";
    console.log(
      `  ${p.sender_item_id.padEnd(28)} ${maskEmail(p.receiver).padEnd(28)} ` +
        `${p.amount.value} ${p.amount.currency}  ${item.transaction_status.padEnd(10)} ` +
        `item=${item.payout_item_id} txn=${item.transaction_id ?? "-"}${err}`,
    );
  }
}

function printSummary(batch: PayoutBatch): void {
  const h = batch.batch_header;
  console.log("\n── Final status ──");
  console.log(`sender_batch_id: ${h.sender_batch_header.sender_batch_id}`);
  console.log(`payout_batch_id: ${h.payout_batch_id}`);
  console.log(`batch_status:    ${h.batch_status}`);
  console.log(`time_created:    ${h.time_created ?? "-"}`);
  console.log(`time_completed:  ${h.time_completed ?? "-"}`);
  console.log(`amount:          ${h.amount ? `${h.amount.value} ${h.amount.currency}` : "-"}`);
  console.log(`fees:            ${h.fees ? `${h.fees.value} ${h.fees.currency}` : "-"}`);
  for (const item of batch.items ?? []) {
    const fee = item.payout_item_fee ? `${item.payout_item_fee.value} ${item.payout_item_fee.currency}` : "-";
    console.log(
      `item ${item.payout_item.sender_item_id}: ${item.transaction_status}` +
        ` (fee ${fee}${item.errors ? `, ${item.errors.name}: ${item.errors.message}` : ""})`,
    );
  }
}

async function main(): Promise<void> {
  const recipients = requireEnv("SHIFTLY_PAYOUT_RECIPIENTS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length !== 3) {
    console.error(`Expected 3 recipients in SHIFTLY_PAYOUT_RECIPIENTS, got ${recipients.length}`);
    process.exit(1);
  }
  console.log(`PayPal host: ${PAYPAL_API}`);
  console.log(`Recipients: ${recipients.map(maskEmail).join(", ")}`);

  const token = await getAccessToken();
  const batchId = await createBatch(token, recipients);

  const started = Date.now();
  let batch: PayoutBatch;
  for (;;) {
    batch = await getBatch(token, batchId);
    printBatch(batch, Date.now() - started);

    const items = batch.items ?? [];
    if (TERMINAL_BATCH_STATES.has(batch.batch_header.batch_status)) break;
    if (items.some((i) => TERMINAL_ITEM_STATES.has(i.transaction_status))) break;
    if (Date.now() - started >= POLL_TIMEOUT_MS) {
      console.log(`\nTimeout: batch not settled after ${POLL_TIMEOUT_MS / 1000}s`);
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  printSummary(batch);
  const ok = batch.batch_header.batch_status === "SUCCESS" && (batch.items ?? []).every((i) => i.transaction_status === "SUCCESS");
  console.log(ok ? "\n✓ PAYOUTS GATE PASSED" : "\n✗ PAYOUTS GATE NOT PASSED");
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
