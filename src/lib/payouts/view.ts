import "server-only";
import { connection } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isBatchOpen } from "./logic";
import { payPreview } from "./service";

/** Serializable batch for the job page and the Pay crew dialog. */
export type BatchView = {
  id: number;
  senderBatchId: string;
  paypalBatchId: string | null;
  status: string;
  errorMessage: string | null;
  demo: boolean;
  open: boolean;
  totalCents: number;
  items: { id: number; workerId: number; name: string; role: Role; amountCents: number; status: string; errorMessage: string | null }[];
};

export async function jobPayouts(jobId: number) {
  await connection();
  const [preview, batches] = await Promise.all([
    payPreview(jobId),
    db().payoutBatch.findMany({
      where: { jobId },
      orderBy: { id: "desc" },
      include: { items: { orderBy: { id: "asc" }, include: { worker: { select: { name: true, role: true } } } } },
    }),
  ]);
  const views: BatchView[] = batches.map((b) => ({
    id: b.id,
    senderBatchId: b.senderBatchId,
    paypalBatchId: b.paypalBatchId,
    status: b.status,
    errorMessage: b.errorMessage,
    demo: b.demo,
    open: isBatchOpen(b),
    totalCents: b.totalCents,
    items: b.items.map((i) => ({ id: i.id, workerId: i.workerId, name: i.worker.name, role: i.worker.role, amountCents: i.amountCents, status: i.status, errorMessage: i.errorMessage })),
  }));
  return { preview, batches: views, open: views.find((b) => b.open) ?? null };
}
