"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Segmented } from "@/components/filters";
import { Skeleton } from "@/components/ui";
import type { SchedulerEvent, SchedulerResource, ValidationContext } from "@/lib/job-detail";
import { roleLabel, roleTokens } from "@/lib/roles";
import type { Zoom } from "./scheduler-view";

// Bryntum touches window/document on import: client-only.
const SchedulerView = dynamic(() => import("./scheduler-view"), {
  ssr: false,
  loading: () => <SchedulerSkeleton rows={6} />,
});

export type CrewScheduleProps = {
  resources: SchedulerResource[];
  events: SchedulerEvent[];
  validation: ValidationContext;
  days: { key: string; label: string; iso: string }[];
  startDate: string;
  endDate: string;
  nights: { startDate: string; endDate: string }[];
  editable: boolean;
  caption: string;
};

export function CrewSchedule(props: CrewScheduleProps) {
  const [zoom, setZoom] = useState<Zoom>("hour");
  const [focus, setFocus] = useState<string | null>(null);
  const height = 64 + props.resources.length * 58 + 2;

  return (
    <section aria-labelledby="schedule-title" className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="schedule-title" className="t-h3">
            Crew schedule
          </h2>
          <p className="text-ink-muted text-[12px]">{props.caption}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {props.days.length > 1 && (
            <div className="flex gap-1" role="group" aria-label="Jump to day">
              {props.days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setFocus(`${d.iso}#${Date.now()}`)}
                  className="border-line bg-surface text-ink-secondary hover:bg-surface-hover h-10 rounded-[8px] border px-3 text-[12px] font-bold"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <Segmented
            label="Zoom"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: "hour", label: "Hour" },
              { value: "day", label: "Day" },
            ]}
          />
          <ul className="text-ink-secondary flex items-center gap-3 text-[12px] font-semibold" aria-label="Role colours">
            {(Object.keys(roleLabel) as (keyof typeof roleLabel)[]).map((r) => (
              <li key={r} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: roleTokens[r].fg }} aria-hidden="true" />
                {roleLabel[r]}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ height }} className="overflow-hidden rounded-[var(--radius-lg)]">
        <SchedulerView
          resources={props.resources}
          events={props.events}
          validation={props.validation}
          startDate={props.startDate}
          endDate={props.endDate}
          nights={props.nights}
          editable={props.editable}
          zoom={zoom}
          height={height}
          focusDate={focus ? focus.split("#")[0] : null}
        />
      </div>
      <p className="text-ink-muted mt-2 text-[12px]">
        {props.editable
          ? "Drag a shift onto another person to reassign it. Role, availability, overlap and 11-hour rest are checked before anything is saved."
          : "Schedule locked once the job has started."}
      </p>
    </section>
  );
}

export function SchedulerSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border-line bg-surface overflow-hidden rounded-[var(--radius-lg)] border" aria-busy="true">
      <div className="bg-surface-alt border-line flex h-16 border-b">
        <div className="border-line w-[248px] border-r" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-line flex h-[58px] items-center border-b last:border-b-0">
          <div className="border-line flex h-full w-[248px] shrink-0 items-center gap-2.5 border-r px-4">
            <Skeleton className="size-[30px] rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="ml-10 h-[34px] w-64 rounded-[8px]" />
        </div>
      ))}
      <span className="sr-only">Loading schedule…</span>
    </div>
  );
}
