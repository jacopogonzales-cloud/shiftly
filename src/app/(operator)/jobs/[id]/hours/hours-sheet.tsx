"use client";

import { Check, LoaderCircle, Minus, Plus, Save, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Avatar, buttonClass, Card, Pill } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { formatMinutes } from "@/lib/format";
import { FLAG_OVER_MINUTES, reconcile, type Flag } from "@/lib/hours";
import { roleLabel } from "@/lib/roles";
import { approveHoursAction, saveHoursAction } from "./actions";

type Row = {
  assignmentId: number;
  workerId: number;
  name: string;
  role: Role;
  day: string;
  dayLabel: string;
  window: string;
  breakMinutes: number;
  planned: number;
  actual: number;
  saved: boolean;
};

const STEP = 15;
const signed = (m: number) => (m === 0 ? "—" : `${m > 0 ? "+" : "−"}${formatMinutes(Math.abs(m))}`);

export function HoursSheet({
  jobId,
  rows: initial,
  flags: savedFlags,
  editable,
  overtimeAfterMinutes,
  lockedNote,
}: {
  jobId: number;
  rows: Row[];
  flags: Flag[];
  editable: boolean;
  overtimeAfterMinutes: number;
  lockedNote: string | null;
}) {
  const [actual, setActual] = useState(() => new Map(initial.map((r) => [r.assignmentId, r.actual])));
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [explanation, setExplanation] = useState("");
  const [saving, startSave] = useTransition();
  const [approving, startApprove] = useTransition();

  const rows = initial.map((r) => ({ ...r, actual: actual.get(r.assignmentId) ?? r.actual }));
  const dirty = rows.some((r) => !r.saved || r.actual !== initial.find((x) => x.assignmentId === r.assignmentId)!.actual);
  // Live preview of what the agent will flag; the saved flags are the ones that gate approval.
  const liveFlags = useMemo(() => reconcile(rows, overtimeAfterMinutes), [rows, overtimeAfterMinutes]);
  const flags = dirty ? liveFlags : savedFlags;
  const flagOf = new Map(flags.map((f) => [f.assignmentId, f]));
  const totals = rows.reduce((t, r) => ({ planned: t.planned + r.planned, actual: t.actual + r.actual }), { planned: 0, actual: 0 });
  const unreviewed = savedFlags.filter((f) => !reviewed.has(f.assignmentId)).length;

  const bump = (id: number, by: number) => setActual((m) => new Map(m).set(id, Math.min(16 * 60, Math.max(0, (m.get(id) ?? 0) + by))));

  const save = () =>
    startSave(async () => {
      const res = await saveHoursAction(
        jobId,
        rows.map((r) => ({ assignmentId: r.assignmentId, actualMinutes: r.actual })),
      );
      toast(res.ok ? "success" : "error", res.message);
      if (res.ok) setReviewed(new Set());
    });

  const approve = () =>
    startApprove(async () => {
      const res = await approveHoursAction(jobId, [...reviewed], explanation);
      toast(res.ok ? "success" : "error", res.message);
    });

  return (
    <div className="space-y-6">
      <div className="border-line bg-surface grid grid-cols-2 overflow-hidden rounded-[var(--radius-lg)] border wide:grid-cols-4">
        {[
          { label: "Planned", value: formatMinutes(totals.planned) },
          { label: "Actual", value: formatMinutes(totals.actual) },
          { label: "Difference", value: signed(totals.actual - totals.planned) },
          { label: "Needs review", value: String(flags.length), tone: flags.length > 0 },
        ].map((m) => (
          <div key={m.label} className="border-line border-r border-b px-6 py-5 last:border-r-0 wide:border-b-0 [&:nth-child(2n)]:border-r-0 wide:[&:nth-child(2n)]:border-r wide:last:border-r-0">
            <p className="text-ink-muted t-small font-bold">{m.label}</p>
            <p className={`t-number-lg mt-2 text-[24px] ${m.tone ? "text-warning-fg" : ""}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {lockedNote && <p className="text-ink-muted text-[13px] font-semibold">{lockedNote}</p>}

      <Card>
        <div className="border-line flex flex-wrap items-center justify-between gap-4 border-b px-6 py-[18px]">
          <div>
            <h2 className="t-h3">Shifts</h2>
            <p className="text-ink-muted t-small font-medium">
              Actual paid time in 15-minute steps, prefilled with the plan. More than {FLAG_OVER_MINUTES} minutes off is flagged by the agent.
            </p>
          </div>
          {editable && (
            <button type="button" onClick={save} disabled={saving} className={`${buttonClass.secondary} disabled:opacity-60`}>
              {saving ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {saving ? "Saving…" : dirty ? "Save hours" : "Saved"}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left" aria-label="Hours per shift">
            <thead>
              <tr className="border-line bg-surface-alt border-b">
                {["Person", "Date", "Shift", "Break", "Planned paid", "Actual paid", "Delta", "Review"].map((h) => (
                  <th key={h} scope="col" className="text-ink-secondary h-11 px-4 text-[11px] font-extrabold tracking-[0.65px] whitespace-nowrap uppercase first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const flag = flagOf.get(r.assignmentId);
                const delta = r.actual - r.planned;
                const newDay = i === 0 || rows[i - 1].day !== r.day;
                return (
                  <tr key={r.assignmentId} className={`border-line border-b align-top last:border-b-0 ${newDay && i > 0 ? "border-t-line-strong border-t" : ""} ${flag ? "bg-warning-bg/40" : ""}`}>
                    <td className="py-3 pr-4 pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} role={r.role} />
                        <div>
                          <p className="text-[13px] font-bold whitespace-nowrap">{r.name}</p>
                          <p className="text-ink-muted text-[11px]">{roleLabel[r.role]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[13px] whitespace-nowrap">{r.dayLabel}</td>
                    <td className="t-number px-4 py-4">{r.window}</td>
                    <td className="t-number text-ink-secondary px-4 py-4">{r.breakMinutes ? `${r.breakMinutes}m` : "—"}</td>
                    <td className="t-number px-4 py-4">{formatMinutes(r.planned)}</td>
                    <td className="px-4 py-2.5">
                      {editable ? (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => bump(r.assignmentId, -STEP)} className="border-line hover:bg-surface-hover grid size-10 place-items-center rounded-[10px] border" aria-label={`${r.name}, ${r.dayLabel} ${r.window}: 15 minutes less`}>
                            <Minus size={14} aria-hidden="true" />
                          </button>
                          <output className="t-number w-[72px] text-center" aria-live="polite">
                            {formatMinutes(r.actual)}
                          </output>
                          <button type="button" onClick={() => bump(r.assignmentId, STEP)} className="border-line hover:bg-surface-hover grid size-10 place-items-center rounded-[10px] border" aria-label={`${r.name}, ${r.dayLabel} ${r.window}: 15 minutes more`}>
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <span className="t-number">{formatMinutes(r.actual)}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">{flag ? <Pill severity="warning">{signed(delta)}</Pill> : <span className="t-number text-ink-muted">{signed(delta)}</span>}</td>
                    <td className="max-w-[300px] py-3 pr-6 pl-4">
                      {flag ? (
                        <div>
                          <p className="text-ink-secondary flex gap-1.5 text-[12px] leading-[18px]">
                            <Sparkles size={13} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                            {flag.note}
                          </p>
                          {editable && !dirty && (
                            <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 text-[12px] font-bold">
                              <input
                                type="checkbox"
                                className="accent-[var(--accent)] size-4"
                                checked={reviewed.has(r.assignmentId)}
                                onChange={(e) =>
                                  setReviewed((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(r.assignmentId);
                                    else next.delete(r.assignmentId);
                                    return next;
                                  })
                                }
                              />
                              Mark reviewed
                            </label>
                          )}
                          {dirty && <p className="text-ink-muted mt-1 text-[11px]">Save to confirm this flag.</p>}
                        </div>
                      ) : (
                        <span className="text-ink-muted text-[12px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <div className="border-line bg-surface sticky bottom-0 flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-lg)] border px-6 py-4">
          <div className="min-w-[280px] flex-1">
            <label htmlFor="explanation" className="mb-1.5 block text-[12px] font-bold">
              Note for the record (optional)
            </label>
            <input
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="e.g. Giulia stayed to finish the lighting test."
              className="border-line-strong bg-surface h-11 w-full rounded-[10px] border px-3 text-[14px]"
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            <button type="button" onClick={approve} disabled={approving || dirty || unreviewed > 0} className={`${buttonClass.primary} disabled:bg-neutral-bg disabled:text-neutral-fg`}>
              {approving ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              {approving ? "Approving…" : "Approve hours"}
            </button>
            <p className="text-ink-muted text-[12px]">
              {dirty ? "Save your changes first." : unreviewed > 0 ? `${unreviewed} flagged ${unreviewed === 1 ? "row" : "rows"} to review.` : "Ready to approve."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
