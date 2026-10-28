"use client";

import { useMemo, useState } from "react";
import { SearchInput } from "@/components/filters";
import { Avatar, buttonClass, Card, Pill, RoleTag, Table, TableFootnote, type Severity } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";

export type CrewRow = {
  id: number;
  name: string;
  notes: string | null;
  role: Role;
  rate: string;
  email: string;
  reliability: number;
  availability: "on-job" | "available" | "unavailable" | "unknown";
  jobCount: number;
};

const availability: Record<CrewRow["availability"], { severity: Severity; label: string }> = {
  available: { severity: "success", label: "Available" },
  "on-job": { severity: "info", label: "On a job" },
  unavailable: { severity: "neutral", label: "Unavailable" },
  unknown: { severity: "neutral", label: "No data" },
};

export function CrewTable({ rows }: { rows: CrewRow[] }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, roleLabel[r.role], r.email, r.notes ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [rows, query]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, role or email…" label="Search crew" />
        <span className="text-ink-secondary ml-auto text-[12px] font-bold">Sort: Role, then name</span>
      </div>

      <Card>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <p className="t-body-strong">No crew matches your filters.</p>
            <button type="button" onClick={() => setQuery("")} className={buttonClass.secondary}>
              Clear filters
            </button>
          </div>
        ) : (
          <Table
            label="Crew table"
            minWidth={840}
            head={[
              { label: "Person" },
              { label: "Role" },
              { label: "Hourly rate", align: "right" },
              { label: "PayPal email", className: "hidden wide:table-cell" },
              { label: "Reliability" },
              { label: "Availability today" },
            ]}
          >
            {visible.map((w) => {
              const a = availability[w.availability];
              return (
                <tr key={w.id} className="h-[68px]">
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={w.name} role={w.role} />
                      <div className="min-w-0">
                        <p className="t-body-strong text-[13px] leading-5 whitespace-nowrap">{w.name}</p>
                        <p className="text-ink-muted text-[11px] leading-4">
                          {w.notes ?? `${w.jobCount} ${w.jobCount === 1 ? "job" : "jobs"} with you`}
                        </p>
                        {/* Below 1200px the email moves under the name so rate and availability stay visible. */}
                        <p className="text-ink-secondary text-[11px] leading-4 wide:hidden">{w.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <RoleTag role={w.role} />
                  </td>
                  <td className="t-number text-right">
                    {w.rate}
                    <span className="text-ink-muted">/h</span>
                  </td>
                  <td className="text-ink-secondary hidden text-[13px] whitespace-nowrap wide:table-cell">{w.email}</td>
                  <td>
                    <div className="flex items-center gap-3" aria-label={`Reliability ${w.reliability} out of 100`}>
                      <span className="t-number w-6 text-right">{w.reliability}</span>
                      <div className="h-[5px] w-20 overflow-hidden rounded-full bg-[var(--surface-pressed)]" aria-hidden="true">
                        <div className="bg-ink-secondary h-full rounded-full" style={{ width: `${w.reliability}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <Pill severity={a.severity}>{a.label}</Pill>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <TableFootnote left={`Showing ${visible.length} of ${rows.length} people`} right="Reliability is an operator rating from 0 to 100" />
    </>
  );
}
