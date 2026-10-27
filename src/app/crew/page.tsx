import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/ui";
import { formatEUR } from "@/lib/format";
import { getCrew } from "@/lib/queries";
import { CrewTable, type CrewRow } from "./crew-table";

export const metadata: Metadata = { title: "Crew" };

export default function CrewPage() {
  return (
    <>
      <PageHeader eyebrow="People / Crew" title="Crew" subtitle="Your trusted people, ready for the next call." />
      <Suspense
        fallback={
          <>
            <div className="mb-5 h-[42px]" />
            <TableSkeleton rows={8} rowHeight={68} columns={["22%", "11%", "10%", "22%", "13%", "11%"]} />
          </>
        }
      >
        <CrewList />
      </Suspense>
    </>
  );
}

async function CrewList() {
  const crew = await getCrew();

  if (crew.length === 0) {
    return <EmptyState title="Add the people you work with">Each person needs a role, an hourly rate and the PayPal email their pay goes to.</EmptyState>;
  }

  const rows: CrewRow[] = crew.map((w) => ({
    id: w.id,
    name: w.name,
    notes: w.notes,
    role: w.role,
    rate: formatEUR(w.hourlyRateCents),
    email: w.paypalEmail,
    reliability: w.reliability,
    availability: w.availability,
    jobCount: w.jobCount,
  }));

  return <CrewTable rows={rows} />;
}
