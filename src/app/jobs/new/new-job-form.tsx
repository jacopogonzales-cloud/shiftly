"use client";

import { Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { buttonClass, Card, Skeleton } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { createJobAction, extractBriefAction, type DraftJob, type DraftShift } from "../actions";

const EXAMPLE =
  "Build a trade-show stand at Fiera Milano Rho, 14–15 November. We need 3 installers, 1 electrician and 1 rigger for 08:00–17:00, with a one-hour break. Client: Horizon Events. Budget 3.500 €.";

const ROLES = Object.keys(roleLabel) as Role[];

const inputClass =
  "h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring aria-invalid:border-error-line";

type Step = "brief" | "review";

export function NewJobForm() {
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<DraftJob | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [extracting, startExtract] = useTransition();
  const [creating, startCreate] = useTransition();
  const step: Step = draft ? "review" : "brief";

  const generate = () => {
    setError(null);
    startExtract(async () => {
      const res = await extractBriefAction(brief);
      if (!res.ok) {
        setError({ message: res.error, field: "brief" });
        return;
      }
      setDraft({ brief, ...res.job, shifts: res.job.shifts.map((s) => ({ ...s, headcount: Math.max(1, s.headcount) })) });
    });
  };

  const confirm = () => {
    if (!draft) return;
    setError(null);
    startCreate(async () => {
      const res = await createJobAction(draft);
      // On success the action redirects; we only get here on a validation error.
      if (res && !res.ok) {
        setError({ message: res.error, field: res.field });
        document.getElementById(res.field ?? "")?.focus();
      }
    });
  };

  const update = (patch: Partial<DraftJob>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateShift = (i: number, patch: Partial<DraftShift>) =>
    setDraft((d) => (d ? { ...d, shifts: d.shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-6">
          <p className="t-eyebrow text-ink-muted">01 / Brief</p>
          <label htmlFor="brief" className="mt-4 mb-1.5 block text-[12px] font-bold">
            Job description
          </label>
          <textarea
            id="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={EXAMPLE}
            aria-invalid={error?.field === "brief" || undefined}
            aria-describedby="brief-help"
            className={`${inputClass} h-auto min-h-[230px] resize-y p-4 leading-[22px]`}
          />
          <p id="brief-help" className="text-ink-muted mt-2 text-[12px]">
            Shiftly never sends invitations before you approve the plan.
          </p>
          {error?.field === "brief" && (
            <p role="alert" className="text-error-fg mt-3 text-[13px] font-semibold">
              {error.message}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={generate} disabled={extracting || brief.trim().length === 0} className={`${buttonClass.primary} disabled:bg-neutral-bg disabled:text-neutral-fg`}>
              {extracting ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
              {draft ? "Regenerate details" : "Generate plan"}
            </button>
            <button type="button" onClick={() => setBrief(EXAMPLE)} disabled={extracting} className={buttonClass.quiet}>
              Try an example
            </button>
          </div>
        </Card>

        <Card className="p-6" aria-live="polite">
          <p className="t-eyebrow text-ink-muted">02 / Extracted details</p>
          {extracting ? (
            <div className="mt-5 space-y-4" aria-busy="true">
              <p className="text-ink-muted flex items-center gap-2 text-[13px]">
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                Reading dates, roles and shift requirements…
              </p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ))}
            </div>
          ) : !draft ? (
            <p className="text-ink-muted mt-5 text-[14px]">Your structured job appears here.</p>
          ) : (
            <div className="mt-5 space-y-4">
              <Field id="title" label="Title" error={error?.field === "title" ? error.message : undefined}>
                <input id="title" className={inputClass} value={draft.title} onChange={(e) => update({ title: e.target.value })} aria-invalid={error?.field === "title" || undefined} />
              </Field>
              <Field id="client" label="Client">
                <input id="client" className={inputClass} value={draft.client} onChange={(e) => update({ client: e.target.value })} />
              </Field>
              <Field id="site" label="Venue" error={error?.field === "site" ? error.message : undefined}>
                <input id="site" className={inputClass} value={draft.site} onChange={(e) => update({ site: e.target.value })} aria-invalid={error?.field === "site" || undefined} />
              </Field>
              <Field id="budget" label="Crew budget (€)" error={error?.field === "budget" ? error.message : undefined}>
                <input
                  id="budget"
                  type="number"
                  min={0}
                  step={50}
                  className={`${inputClass} t-number`}
                  value={draft.budgetEur ?? ""}
                  placeholder="Not stated"
                  onChange={(e) => update({ budgetEur: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
              {(draft.assumptions.length > 0 || draft.missing.length > 0) && (
                <ul className="space-y-2 pt-1">
                  {draft.assumptions.map((a) => (
                    <li key={a} className="bg-warning-bg text-warning-fg rounded-[10px] px-3 py-2 text-[12px] leading-[18px] font-bold">
                      {a.startsWith("Assumed") ? a : `Assumed: ${a}`}
                    </li>
                  ))}
                  {draft.missing.map((m) => (
                    <li key={m} className="bg-error-bg text-error-fg rounded-[10px] px-3 py-2 text-[12px] leading-[18px] font-bold">
                      {m.startsWith("Missing") ? m : `Missing: ${m}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>

      {draft && !extracting && (
        <>
          <Card>
            <div className="border-line flex items-center justify-between border-b px-6 py-[18px]">
              <div>
                <h2 className="t-h3">Shifts</h2>
                <p className="text-ink-muted t-small font-medium">One line per day and role. Times are Europe/Rome; the break is unpaid.</p>
              </div>
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() => {
                  const last = draft.shifts.at(-1);
                  update({ shifts: [...draft.shifts, last ? { ...last, headcount: 1 } : { date: "", start: "08:00", end: "17:00", breakMinutes: 60, role: "MONTATORE", headcount: 1, notes: "" }] });
                }}
              >
                <Plus size={16} aria-hidden="true" /> Add shift
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left" aria-label="Extracted shifts">
                <thead>
                  <tr className="border-line bg-surface-alt border-b">
                    {["Date", "Start", "End", "Break (min)", "Role", "People", "Note", ""].map((h) => (
                      <th key={h} scope="col" className="text-ink-secondary h-11 px-3 text-[11px] font-extrabold tracking-[0.65px] uppercase first:pl-6 last:pr-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.shifts.map((s, i) => {
                    const invalid = error?.field === `shift-${i}`;
                    return (
                      <tr key={i} className={`border-line border-b last:border-b-0 ${invalid ? "bg-error-bg" : ""}`}>
                        <td className="py-2.5 pr-3 pl-6">
                          <input id={`shift-${i}`} type="date" className={`${inputClass} t-number w-40`} value={s.date} onChange={(e) => updateShift(i, { date: e.target.value })} aria-invalid={invalid || undefined} aria-label={`Shift ${i + 1} date`} />
                        </td>
                        <td className="px-3">
                          <input type="time" className={`${inputClass} t-number w-28`} value={s.start} onChange={(e) => updateShift(i, { start: e.target.value })} aria-label={`Shift ${i + 1} start`} />
                        </td>
                        <td className="px-3">
                          <input type="time" className={`${inputClass} t-number w-28`} value={s.end} onChange={(e) => updateShift(i, { end: e.target.value })} aria-label={`Shift ${i + 1} end`} />
                        </td>
                        <td className="px-3">
                          <input type="number" min={0} step={15} className={`${inputClass} t-number w-24`} value={s.breakMinutes} onChange={(e) => updateShift(i, { breakMinutes: Number(e.target.value) })} aria-label={`Shift ${i + 1} break in minutes`} />
                        </td>
                        <td className="px-3">
                          <select className={`${inputClass} w-40`} value={s.role} onChange={(e) => updateShift(i, { role: e.target.value as Role })} aria-label={`Shift ${i + 1} role`}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3">
                          <input type="number" min={1} max={50} className={`${inputClass} t-number w-20`} value={s.headcount} onChange={(e) => updateShift(i, { headcount: Number(e.target.value) })} aria-label={`Shift ${i + 1} headcount`} />
                        </td>
                        <td className="px-3">
                          <input className={`${inputClass} min-w-40`} value={s.notes} onChange={(e) => updateShift(i, { notes: e.target.value })} aria-label={`Shift ${i + 1} note`} />
                        </td>
                        <td className="pr-6 pl-3">
                          <button
                            type="button"
                            onClick={() => update({ shifts: draft.shifts.filter((_, j) => j !== i) })}
                            className="text-ink-muted hover:bg-surface-hover hover:text-error-fg grid size-10 place-items-center rounded-[10px]"
                            aria-label={`Remove shift ${i + 1}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <Stepper step={step} />
            <div className="flex flex-wrap items-center gap-3">
              {error && error.field !== "brief" && (
                <p role="alert" className="text-error-fg text-[13px] font-semibold">
                  {error.message}
                </p>
              )}
              <button type="button" onClick={confirm} disabled={creating} className={`${buttonClass.primary} disabled:bg-neutral-bg disabled:text-neutral-fg`}>
                {creating ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                {creating ? "Creating job…" : "Confirm details & open planner"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-bold">
        {label}
      </label>
      {children}
      {error && <p className="text-error-fg mt-1.5 text-[12px] font-semibold">{error}</p>}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = ["Brief", "Review details", "Review schedule"];
  const current = step === "brief" ? 0 : 1;
  return (
    <ol className="flex items-center gap-2 text-[12px] font-bold" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          {i > 0 && <span className="text-ink-muted" aria-hidden="true">→</span>}
          <span aria-current={i === current ? "step" : undefined} className={i === current ? "text-accent" : i < current ? "text-ink" : "text-ink-muted"}>
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}
