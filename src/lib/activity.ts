import "server-only";
import type { Actor, Prisma } from "@/generated/prisma/client";

type Tx = Pick<Prisma.TransactionClient, "activityLog">;

/** Every state change goes through here: actor, type, one-line message, structured data. */
export function logActivity(
  tx: Tx,
  entry: { jobId: number | null; actor: Actor; type: string; message: string; data?: Prisma.InputJsonValue },
) {
  return tx.activityLog.create({ data: entry });
}
