import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/db";

// Read-side queries for the shell. Each one waits for a request so nothing touches the DB at build time.

export async function getSettings() {
  await connection();
  return db().settings.findUnique({ where: { id: 1 } });
}

export async function getJobs() {
  await connection();
  return db().job.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      shifts: { select: { headcount: true, assignments: { select: { status: true } } } },
    },
  });
}

export async function getCrew() {
  await connection();
  return db().worker.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      assignments: { where: { status: "CONFIRMED" }, select: { shift: { select: { jobId: true } } } },
    },
  });
}

export async function getPayoutBatches() {
  await connection();
  return db().payoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { title: true, client: true } },
      items: { orderBy: { id: "asc" }, include: { worker: { select: { name: true, role: true } } } },
    },
  });
}
