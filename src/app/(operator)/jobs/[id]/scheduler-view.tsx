"use client";

import "./scheduler-theme.css";

import type { DomConfig, EventModel, Model, ResourceModel, Scheduler, SchedulerConfig } from "@bryntum/scheduler";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/toast";
import { buttonClass } from "@/components/ui";
import { checkAssignment } from "@/lib/planning/constraints";
import type { SchedulerEvent, SchedulerResource, ValidationContext } from "@/lib/job-detail";
import { moveAssignmentAction } from "../actions";
import { loadBryntum } from "./bryntum";
import { SchedulerSkeleton } from "./scheduler-skeleton";

// Bryntum Scheduler, themed per docs/design/design-system.md §06. Client-only.
// Bryntum is loaded at runtime from /vendor/bryntum (never bundled), so the Scheduler class is driven directly:
// created once, then data, zoom, height and lock state are pushed through its runtime API.

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
    displayDateFormat: "ddd DD MMM HH:mm",
    headers: [
      { unit: "day", dateFormat: "ddd DD MMM YYYY" },
      { unit: "hour", dateFormat: "HH:mm" },
    ],
  },
  day: {
    base: "weekAndDay",
    tickWidth: 160,
    displayDateFormat: "ddd DD MMM HH:mm",
    headers: [
      { unit: "week", dateFormat: "MMM YYYY" },
      { unit: "day", dateFormat: "ddd DD" },
    ],
  },
};

const toResources = (resources: SchedulerResource[]) => resources.map((r) => ({ id: r.id, name: r.name, info: { ...r } }));
const toEvents = (events: SchedulerEvent[], editable: boolean) =>
  events.map((e) => ({
    id: e.id,
    resourceId: e.resourceId,
    startDate: e.startDate,
    endDate: e.endDate,
    name: e.label,
    draggable: editable && e.status !== "DECLINED",
    resizable: false,
  }));
const toTimeRanges = (nights: SchedulerViewProps["nights"]) => nights.map((n, i) => ({ id: `night-${i}`, startDate: n.startDate, endDate: n.endDate, cls: "shiftly-offhours" }));

export default function SchedulerView(props: SchedulerViewProps) {
  const { resources, events, validation, startDate, endDate, nights, editable, zoom, height, focusDate } = props;
  const container = useRef<HTMLDivElement>(null);
  // The instance lives in a ref (Bryntum mutates it); `ready` re-runs the update effects once it exists.
  const instance = useRef<Scheduler | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Bryntum callbacks are created once; they read the current props through this ref.
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const workers = useMemo(() => new Map(validation.workers.map((w) => [w.id, w])), [validation]);
  const latest = useRef({ byId, workers, validation });
  useEffect(() => {
    latest.current = { byId, workers, validation };
  }, [byId, workers, validation]);

  // Create once Bryntum is loaded; the initial props are read from a ref so prop changes don't recreate it.
  const initial = useRef(props);
  useEffect(() => {
    let cancelled = false;
    loadBryntum()
      .then(({ Scheduler, StringHelper }) => {
        if (cancelled || !container.current) return;
        const p = initial.current;
        const config: Partial<SchedulerConfig> = {
          appendTo: container.current,
          cls: "shiftly-scheduler",
          height: p.height,
          timeZone: "Europe/Rome",
          startDate: new Date(p.startDate),
          endDate: new Date(p.endDate),
          viewPreset: PRESETS[p.zoom],
          rowHeight: 58,
          barMargin: 12,
          eventStyle: "tonal",
          resources: toResources(p.resources),
          events: toEvents(p.events, p.editable),
          timeRanges: toTimeRanges(p.nights),
          readOnly: !p.editable,
          zoomOnMouseWheel: false,
          zoomOnTimeAxisDoubleClick: false,
          columns: [
            {
              text: "People / Role",
              field: "name",
              width: 248,
              htmlEncode: false,
              // Read from the record (not a closure) so Bryntum re-renders the row when the data changes.
              renderer: ({ record }: { record: Model }): DomConfig => {
                const r = record.get("info") as SchedulerResource | undefined;
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
          features: {
            timeRanges: { showCurrentTimeLine: { name: "Now" } },
            eventEdit: false,
            eventResize: false,
            eventDragCreate: false,
            eventMenu: false,
            scheduleMenu: false,
            cellMenu: false,
            headerMenu: false,
            timeAxisHeaderMenu: false,
            sort: false,
            scheduleTooltip: false,
            eventTooltip: {
              template: ({ eventRecord }: { eventRecord: EventModel }) => {
                const e = latest.current.byId.get(Number(eventRecord.id));
                if (!e) return "";
                return [
                  `<strong>${StringHelper.encodeHtml(e.label)}</strong>`,
                  `<div>${STATUS_TEXT[e.status]}</div>`,
                  e.reason ? `<div class="shiftly-tip-reason">${StringHelper.encodeHtml(e.reason)}</div>` : "",
                  ...e.conflicts.map((c) => `<div class="shiftly-tip-conflict">Conflict: ${StringHelper.encodeHtml(c.message)}</div>`),
                ].join("");
              },
            },
            eventDrag: {
              constrainDragToTimeSlot: true,
              // Same checker the server runs; the server re-checks on drop.
              validatorFn: ({ eventRecords, newResource }: { eventRecords: EventModel[]; newResource: ResourceModel }) => {
                const { byId, workers, validation } = latest.current;
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
            },
          },
          listeners: {
            beforeEventDropFinalize: ({ context }) => {
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
            },
          },
          eventRenderer: ({ eventRecord, renderData }: { eventRecord: EventModel; renderData: { cls: unknown; ariaLabel?: string } }) => {
            const e = latest.current.byId.get(Number(eventRecord.id));
            if (!e) return eventRecord.name;
            const cls = renderData.cls as Record<string, boolean>;
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
          },
        };
        instance.current = new Scheduler(config as SchedulerConfig);
        setReady(true);
      })
      .catch((err) => {
        console.error("Bryntum Scheduler failed to load", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
      setReady(false);
    };
  }, [attempt]);

  // Runtime updates after the first render.
  useEffect(() => {
    if (ready && instance.current) instance.current.resourceStore.data = toResources(resources);
  }, [ready, resources]);
  useEffect(() => {
    const s = instance.current;
    if (!ready || !s) return;
    s.eventStore.data = toEvents(events, editable);
    s.readOnly = !editable;
  }, [ready, events, editable]);
  useEffect(() => {
    if (ready && instance.current) instance.current.timeRangeStore.data = toTimeRanges(nights);
  }, [ready, nights]);
  useEffect(() => {
    if (ready && instance.current) instance.current.setTimeSpan(new Date(startDate), new Date(endDate));
  }, [ready, startDate, endDate]);
  useEffect(() => {
    // A preset config is accepted at runtime; the typings only list preset names and instances.
    if (ready && instance.current) instance.current.viewPreset = PRESETS[zoom] as unknown as Scheduler["viewPreset"];
  }, [ready, zoom]);
  useEffect(() => {
    if (ready && instance.current) instance.current.height = height;
  }, [ready, height]);
  useEffect(() => {
    if (ready && instance.current && focusDate) void instance.current.scrollToDate(new Date(focusDate), { block: "start", animate: true });
  }, [ready, focusDate, zoom]);

  if (failed) {
    return (
      <div role="alert" className="border-line bg-surface flex h-full flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border px-6 text-center">
        <p className="t-body-strong">Couldn&apos;t load schedule.</p>
        <p className="text-ink-muted text-[13px]">Hours, invitations and the agent log below are unaffected.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
          className={buttonClass.secondary}
        >
          <RotateCcw size={16} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {!ready && (
        <div className="absolute inset-0 z-10">
          <SchedulerSkeleton rows={Math.max(1, Math.round((height - 66) / 58))} />
        </div>
      )}
      <div ref={container} className="h-full" />
    </div>
  );
}
