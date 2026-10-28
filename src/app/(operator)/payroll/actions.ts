"use server";

import { refresh } from "next/cache";
import { approvePayout, reconcile, retryFailed, type PayResult } from "@/lib/payouts/service";

// Money moves only through payCrewAction and retryFailedAction, each called from a confirm step that showed the total.

const validId = (n: number) => Number.isInteger(n) && n > 0;
const validCents = (n: number) => Number.isInteger(n) && n > 0;

export async function payCrewAction(jobId: number, expectedTotalCents: number): Promise<PayResult> {
  if (!validId(jobId) || !validCents(expectedTotalCents)) return { ok: false, message: "Invalid request." };
  try {
    return await approvePayout(jobId, expectedTotalCents);
  } catch (err) {
    console.error("payCrewAction", err);
    return { ok: false, message: "Couldn't create the payout. Nothing was sent." };
  } finally {
    refresh();
  }
}

export async function retryFailedAction(batchId: number, expectedTotalCents: number): Promise<PayResult> {
  if (!validId(batchId) || !validCents(expectedTotalCents)) return { ok: false, message: "Invalid request." };
  try {
    return await retryFailed(batchId, expectedTotalCents);
  } catch (err) {
    console.error("retryFailedAction", err);
    return { ok: false, message: "Couldn't create the retry. Nothing was sent." };
  } finally {
    refresh();
  }
}

/** Reads PayPal only: the job page polls this while a batch is open, and "Check status" calls it. */
export async function checkPayoutsAction(target: { jobId?: number; batchId?: number }): Promise<{ ok: boolean; message: string }> {
  const jobId = target.jobId && validId(target.jobId) ? target.jobId : undefined;
  const batchId = target.batchId && validId(target.batchId) ? target.batchId : undefined;
  if (!jobId && !batchId) return { ok: false, message: "Invalid request." };
  try {
    const results = await reconcile({ jobId, batchId });
    const failed = results.find((r) => !r.ok);
    return failed ? { ok: false, message: failed.message } : { ok: true, message: results.length ? "Status updated from PayPal." : "Nothing in flight." };
  } catch (err) {
    console.error("checkPayoutsAction", err);
    return { ok: false, message: "Couldn't reach PayPal. Try again in a moment." };
  } finally {
    refresh();
  }
}
