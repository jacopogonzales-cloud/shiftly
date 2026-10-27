import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed public invitation links: /confirm/<jobId>.<workerId>.<expiry>.<signature>
// One link per person per job. HMAC-SHA256 with a key derived from SHIFTLY_CRON_SECRET, so a link can't be
// forged or edited, and it expires when the person's first shift starts. Replays are harmless: answers only
// apply to invitations still awaiting a response.

function key(): Buffer {
  const secret = process.env.SHIFTLY_CRON_SECRET;
  if (!secret) throw new Error("SHIFTLY_CRON_SECRET is not set");
  return createHmac("sha256", secret).update("shiftly:confirm-link:v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url").slice(0, 32);
}

export function inviteToken(jobId: number, workerId: number, expiresAt: Date): string {
  const payload = `${jobId}.${workerId}.${Math.floor(expiresAt.getTime() / 1000).toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

export function invitePath(jobId: number, workerId: number, expiresAt: Date): string {
  return `/confirm/${inviteToken(jobId, workerId, expiresAt)}`;
}

/** Null for anything malformed or tampered with. Expiry is returned, not enforced, so callers can tell the states apart. */
export function readInviteToken(token: string): { jobId: number; workerId: number; expiresAt: Date } | null {
  const parts = decodeURIComponent(token).split(".");
  if (parts.length !== 4) return null;
  const [job, worker, exp, sig] = parts;
  const expected = Buffer.from(sign(`${job}.${worker}.${exp}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const jobId = Number(job);
  const workerId = Number(worker);
  const seconds = parseInt(exp, 36);
  if (!Number.isInteger(jobId) || !Number.isInteger(workerId) || !Number.isFinite(seconds)) return null;
  return { jobId, workerId, expiresAt: new Date(seconds * 1000) };
}
