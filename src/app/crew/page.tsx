import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, EmptyState, PageHeader, RoleTag, Table, TableSkeleton } from "@/components/ui";
import { formatEUR } from "@/lib/format";
import { getCrew } from "@/lib/queries";

export const metadata: Metadata = { title: "Crew" };

export default function CrewPage() {
  return (
    <>
      <PageHeader title="Crew" />
      <Suspense fallback={<TableSkeleton rows={8} cols={6} />}>
        <CrewTable />
      </Suspense>
    </>
  );
}

async function CrewTable() {
  const crew = await getCrew();

  if (crew.length === 0) {
    return (
      <EmptyState
        title="No crew yet"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="9" cy="8.5" r="3.25" />
            <path d="M3 19.5c.8-3.1 3.1-4.75 6-4.75s5.2 1.65 6 4.75M16.5 6v5M14 8.5h5" />
          </svg>
        }
      >
        Add the freelancers you call for jobs, with their role, hourly rate and PayPal email. The agent only plans with people listed here.
      </EmptyState>
    );
  }

  return (
    <Card>
      <Table
        head={[
          { label: "Name" },
          { label: "Role" },
          { label: "Rate", align: "right" },
          { label: "Reliability" },
          { label: "Jobs", align: "right" },
          { label: "PayPal" },
          { label: "Phone" },
        ]}
      >
        {crew.map((w) => {
          const jobs = new Set(w.assignments.map((a) => a.shift.jobId)).size;
          return (
            <tr key={w.id}>
              <td>
                <p className="font-semibold whitespace-nowrap">{w.name}</p>
                {w.notes && <p className="text-text-3 text-[13px]">{w.notes}</p>}
              </td>
              <td>
                <RoleTag role={w.role} />
              </td>
              <td className="num text-right whitespace-nowrap">
                {formatEUR(w.hourlyRateCents)}
                <span className="text-text-3">/h</span>
              </td>
              <td>
                <Reliability value={w.reliability} />
              </td>
              <td className="num text-right">{jobs}</td>
              <td className="num text-info text-[13px] whitespace-nowrap">{w.paypalEmail}</td>
              <td className="num text-text-2 text-[13px] whitespace-nowrap">{w.phone ?? "—"}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

function Reliability({ value }: { value: number }) {
  const color = value >= 85 ? "var(--ok)" : value >= 70 ? "var(--text-2)" : "var(--err)";
  return (
    <div className="flex items-center gap-3" aria-label={`Reliability ${value} out of 100`}>
      <div className="bg-bg-2 h-1.5 w-20 overflow-hidden rounded-full">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="num text-text-2 text-[13px]">{value}</span>
    </div>
  );
}
