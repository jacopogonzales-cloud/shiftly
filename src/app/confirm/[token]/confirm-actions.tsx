"use client";

import { Check, CircleX, LoaderCircle } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { buttonClass, Pill } from "@/components/ui";
import { DECLINE_REASONS } from "@/lib/invitations/reasons";
import { respondAction } from "../actions";

type State = "awaiting" | "accepted" | "declined";

export function ConfirmActions({ token, initial, deadline, firstName, children }: { token: string; initial: State; deadline: string; firstName: string; children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const answer = (decision: "accept" | "decline") =>
    start(async () => {
      setError(null);
      try {
        const res = await respondAction(token, decision, reason || undefined);
        if (res.ok) setState(res.state);
        else setError(res.message);
      } catch {
        setError("Couldn't send your answer. Try again.");
      }
    });

  return (
    <>
      <div className="mt-3">
        {state === "awaiting" && <Pill severity="info">Awaiting your response</Pill>}
        {state === "accepted" && <Pill severity="success">Accepted</Pill>}
        {state === "declined" && <Pill severity="error">Declined</Pill>}
      </div>

      {state === "accepted" && (
        <div className="mt-5 flex items-start gap-3" role="status">
          <span className="border-success-fg text-success-fg grid size-11 shrink-0 place-items-center rounded-full border-2" aria-hidden="true">
            <Check size={22} />
          </span>
          <div>
            <p className="text-[18px] font-extrabold">You&apos;re confirmed, {firstName}.</p>
            <p className="text-ink-muted text-[14px]">The operator has been notified. Your shift details stay on this page.</p>
          </div>
        </div>
      )}
      {state === "declined" && (
        <div className="mt-5 flex items-start gap-3" role="status">
          <span className="border-error-fg text-error-fg grid size-11 shrink-0 place-items-center rounded-full border-2" aria-hidden="true">
            <CircleX size={22} />
          </span>
          <div>
            <p className="text-[18px] font-extrabold">You declined this shift.</p>
            <p className="text-ink-muted text-[14px]">The operator will look for someone else. Thanks for letting us know.</p>
          </div>
        </div>
      )}

      {children}

      {state === "awaiting" && (
        <div className="border-line mt-5 border-t pt-5">
          <p className="text-ink-secondary text-[13px]">
            Please confirm by <strong className="text-ink">{deadline}</strong> so the operator can finalize the crew.
          </p>

          {!declining ? (
            <div className="mt-5 flex flex-col gap-2.5">
              <button type="button" disabled={pending} onClick={() => answer("accept")} className={`${buttonClass.primary} h-12 w-full text-[14px] disabled:bg-neutral-bg disabled:text-neutral-fg`}>
                {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                {pending ? "Sending…" : "Accept shift"}
              </button>
              <button type="button" disabled={pending} onClick={() => setDeclining(true)} className={`${buttonClass.secondary} h-12 w-full text-[14px]`}>
                Decline
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <label htmlFor="reason" className="block text-[12px] font-bold">
                Reason (optional)
              </label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border-line-strong bg-surface h-12 w-full rounded-[10px] border px-3 text-[14px]"
              >
                <option value="">Prefer not to say</option>
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => answer("decline")}
                className="bg-error-bg text-error-fg hover:bg-error-line inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-[14px] font-bold"
              >
                {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
                {pending ? "Sending…" : "Decline shift"}
              </button>
              <button type="button" disabled={pending} onClick={() => setDeclining(false)} className={`${buttonClass.quiet} h-12 w-full`}>
                Back
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-error-fg mt-3 text-[13px] font-semibold">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
