"use client";

import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/svalbard-light.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import "./scheduler-theme.css";

import { StringHelper, type DomConfig, type EventModel, type ResourceModel } from "@bryntum/scheduler";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "@/components/toast";
import { checkAssignment } from "@/lib/planning/constraints";
import type { SchedulerEvent, SchedulerResource, ValidationContext } from "@/lib/job-detail";
import { moveAssignmentAction } from "../actions";

// Bryntum Scheduler, themed per docs/design/design-system.md §06. Client-only (loaded with ssr:false).

export type Zoom = "hour" | "day";

export type SchedulerViewProps = {
  resources: SchedulerResource[];
  events: SchedulerEvent[];
  validation: ValidationContext;
  startDate: string;
  endDate: string;
  nights: { startDate: string; endDate: string }[];
  editable: boolean;
  zoom: Zoom;
  height: number;
  /** ISO date to scroll into view; changes trigger a scroll. */
  focusDate: string | null;
};

const ROLE_CLASS = { MONTATORE: "role-installer", ELETTRICISTA: "role-electrician", RIGGER: "role-rigger", AUTISTA: "role-driver" } as const;
const STATUS_TEXT = { PROPOSED: "Proposed", SENT: "Awaiting response", CONFIRMED: "Accepted", DECLINED: "Declined" } as const;

const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(ms);

const PRESETS = {
  hour: {
    base: "hourAndDay",
    tickWidth: 76,
    headers: [
      { unit: "day", dateFormat: "ddd DD MMM YYYY" },
      { unit: "hour", dateFormat: "HH:mm" },
    ],
  },
  day: {
    base: "weekAndDay",
    tickWidth: 160,
    headers: [
      { unit: "week", dateFormat: "MMM YYYY" },
      { unit: "day", dateFormat: "ddd DD" },
    ],
  },
};

export default function SchedulerView({ resources, events, validation, startDate, endDate, nights, editable, zoom, height, focusDate }: SchedulerViewProps) {
  const ref = useRef<BryntumScheduler>(null);

  useEffect(() => {
    if (focusDate) void ref.current?.instance?.scrollToDate(new Date(focusDate), { block: "start", animate: true });
  }, [focusDate, zoom]);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const workers = useMemo(() => new Map(validation.workers.map((w) => [w.id, w])), [validation]);

  const eventData = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        resourceId: e.resourceId,
        startDate: e.startDate,
        endDate: e.endDate,
        name: e.label,
        draggable: editable && e.status !== "DECLINED",
        resizable: false,
      })),
    [events, editable],
  );

  const columns = useMemo(
    () => [
      {
        text: "People / Role",
        field: "name",
        width: 248,
        htmlEncode: false,
        renderer: ({ record }: { record: ResourceModel }): DomConfig => {
          const r = resources.find((x) => x.id === record.id);
          return {
            class: "shiftly-person",
            children: [
              { class: `shiftly-avatar ${r ? ROLE_CLASS[r.role] : ""}`, text: r?.initials ?? "" },
              {
                class: "shiftly-person-text",
                children: [
                  { class: "shiftly-person-name", text: r?.name ?? "" },
                  { class: "shiftly-person-role", text: r ? `${r.roleLabel}${r.onJob ? "" : " · not on this job"}` : "" },
                ],
              },
            ],
          };
        },
      },
    ],
    [resources],
  );

  return (
    <BryntumScheduler
      ref={ref}
      cls="shiftly-scheduler"
      height={height}
      timeZone="Europe/Rome"
      startDate={new Date(startDate)}
      endDate={new Date(endDate)}
      viewPreset={PRESETS[zoom]}
      rowHeight={58}
      barMargin={12}
      eventStyle="tonal"
      resources={resources.map((r) => ({ id: r.id, name: r.name }))}
      events={eventData}
      columns={columns}
      timeRanges={nights.map((n, i) => ({ id: `night-${i}`, startDate: n.startDate, endDate: n.endDate, cls: "shiftly-offhours" }))}
      timeRangesFeature={{ showCurrentTimeLine: { name: "Now" } }}
      readOnly={!editable}
      zoomOnMouseWheel={false}
      zoomOnTimeAxisDoubleClick={false}
      eventEditFeature={false}
      eventResizeFeature={false}
      eventDragCreateFeature={false}
      eventMenuFeature={false}
      scheduleMenuFeature={false}
      cellMenuFeature={false}
      headerMenuFeature={false}
      timeAxisHeaderMenuFeature={false}
      sortFeature={false}
      eventTooltipFeature={{
        template: ({ eventRecord }: { eventRecord: EventModel }) => {
          const e = byId.get(Number(eventRecord.id));
          if (!e) return "";
          const lines = [
            `<strong>${StringHelper.encodeHtml(e.label)}</strong>`,
            `<div>${STATUS_TEXT[e.status]}</div>`,
            e.reason ? `<div class="shiftly-tip-reason">${StringHelper.encodeHtml(e.reason)}</div>` : "",
            ...e.conflicts.map((c) => `<div class="shiftly-tip-conflict">Conflict: ${StringHelper.encodeHtml(c.message)}</div>`),
          ];
          return lines.join("");
        },
      }}
      eventDragFeature={{
        constrainDragToTimeSlot: true,
        // Same checker the server runs; the server re-checks on drop.
        validatorFn: ({ eventRecords, newResource }: { eventRecords: EventModel[]; newResource: ResourceModel }) => {
          const e = byId.get(Number(eventRecords[0]?.id));
          const worker = workers.get(Number(newResource?.id));
          if (!e || !worker) return { valid: false, message: "Unknown person." };
          if (worker.id === e.resourceId) return true;
          const conflicts = checkAssignment({
            worker,
            shift: { shiftId: e.shiftId, role: e.role, start: Date.parse(e.startDate), end: Date.parse(e.endDate) },
            bookings: validation.bookings,
            minRestHours: validation.minRestHours,
            dayKey,
            ignoreAssignmentId: e.id,
          });
          return conflicts.length ? { valid: false, message: conflicts[0].message } : { valid: true, message: `Give this shift to ${worker.name.split(" ")[0]}` };
        },
      }}
      onBeforeEventDropFinalize={({ context }) => {
        const from = Number(context.resourceRecord?.id);
        const to = Number(context.newResource?.id);
        if (!to || from === to) return;
        context.async = true;
        moveAssignmentAction(Number(context.eventRecord.id), to)
          .then((res) => {
            context.finalize(res.ok);
            toast(res.ok ? "success" : "error", res.message);
          })
          .catch(() => {
            context.finalize(false);
            toast("error", "Couldn't save the move. Nothing changed.");
          });
      }}
      eventRenderer={({ eventRecord, renderData }) => {
        const e = byId.get(Number(eventRecord.id));
        if (!e) return eventRecord.name;
        const cls = renderData.cls as unknown as Record<string, boolean>;
        cls[ROLE_CLASS[e.role]] = true;
        cls[`status-${e.status.toLowerCase()}`] = true;
        cls.conflict = e.conflicts.length > 0;
        cls.declined = e.status === "DECLINED";
        renderData.ariaLabel = `${e.label}, ${STATUS_TEXT[e.status]}${e.conflicts.length ? `, conflict: ${e.conflicts[0].message}` : ""}`;
        return [
          {
            class: "shiftly-ev-title",
            children: [
              e.conflicts.length ? { tag: "i", class: "fa fa-circle-exclamation shiftly-ev-icon", "aria-hidden": "true" } : null,
              { tag: "span", text: e.status === "DECLINED" ? `Declined · ${e.label.split(" · ")[1]}` : e.label.split(" · ")[1] },
              e.status === "CONFIRMED" ? { tag: "i", class: "fa fa-check shiftly-ev-icon", "aria-hidden": "true" } : null,
            ],
          },
          { class: "shiftly-ev-time", text: e.label.split(" · ")[0] },
        ] as DomConfig[];
      }}
    />
  );
}
