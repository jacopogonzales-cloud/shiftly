"use client";

import { useMemo, useState } from "react";
import { SearchInput, Segmented } from "@/components/filters";
import { buttonClass, Card, CardHeader, JobStatusPill, Table, TableFootnote } from "@/components/ui";
import type { JobStatus } from "@/generated/prisma/enums";

export type JobRow = {
  id: number;
  ref: string;
  title: string;
  client: string;
  site: string;
  dates: string;
  startsAt: number;
  status: JobStatus;
  confirmed: number;
  needed: number;
  budget: string;
  forecast: string;
  forecastRatio: number;
  forecastLabel: "planned" | "final";
};

type Segment = "all" | "upcoming" | "to-pay" | "paid";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "All jobs" },
  { value: "upcoming", label: "Upcoming" },
  { value: "to-pay", label: "To pay" },
  { value: "paid", label: "Paid" },
];

const UPCOMING: JobStatus[] = ["PLANNING", "CREW_CONFIRMED"];

export function JobsTable({ rows }: { rows: JobRow[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (segment === "upcoming" && !UPCOMING.includes(r.status)) return false;
      if (segment === "to-pay" && r.status !== "DONE") return false;
      if (segment === "paid" && r.status !== "PAID") return false;
      return !q || [r.title, r.client, r.site, r.ref].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, segment]);

  const filtered = query !== "" || segment !== "all";
  const clear = () => {
    setQuery("");
    setSegment("all");
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search jobs, clients, locations…" label="Search jobs" />
        <Segmented options={SEGMENTS} value={segment} onChange={setSegment} label="Filter jobs" />
        <span className="text-ink-secondary ml-auto text-[12px] font-bold">Sort: Most recent</span>
      </div>

      <Card>
        <CardHeader title={SEGMENTS.find((s) => s.value === segment)!.label} subtitle="From the first shift to the final payout" aside={`${visible.length} ${visible.length === 1 ? "job" : "jobs"}`} />
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <p className="t-body-strong">No jobs match these filters.</p>
            <button type="button" onClick={clear} className={buttonClass.secondary}>
              Clear filters
            </button>
          </div>
        ) : (
          <Table
            label="Jobs table"
            minWidth={980}
            head={[{ label: "Job" }, { label: "Dates" }, { label: "Location" }, { label: "Crew" }, { label: "Status" }, { label: "Budget / forecast" }]}
          >
            {visible.map((r) => (
              <tr key={r.id} className="h-[76px]">
                <td>
                  <p className="t-body-strong text-[13px] leading-5 whitespace-nowrap">{r.title}</p>
                  <p className="text-ink-muted mt-1 text-[11px] leading-4">
                    {r.ref} · {r.client}
                  </p>
                </td>
                <td className="text-[13px] whitespace-nowrap">{r.dates}</td>
                <td className="text-ink-secondary max-w-[220px] text-[13px]">{r.site}</td>
                <td className="t-number">
                  {r.confirmed} / {r.needed}
                </td>
                <td>
                  <JobStatusPill status={r.status} />
                </td>
                <td>
                  <p className="t-number-xs text-[12px]" title={`Budget / ${r.forecastLabel} labour cost`}>
                    {r.budget} <span className="text-ink-muted">/</span> {r.forecast}
                  </p>
                  <div className="mt-2 h-[5px] w-[112px] overflow-hidden rounded-full bg-[var(--surface-pressed)]" aria-hidden="true">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, r.forecastRatio * 100)}%`, background: r.forecastRatio > 1 ? "var(--error-fg)" : "var(--accent)" }}
                    />
                  </div>
                  {r.forecastRatio > 1 && <p className="text-error-fg mt-1 text-[11px] font-bold">Over budget</p>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <TableFootnote left={`Showing ${visible.length} of ${rows.length} ${rows.length === 1 ? "job" : "jobs"}${filtered ? " · filtered" : ""}`} right="All amounts in EUR · Europe/Rome" />
    </>
  );
}
