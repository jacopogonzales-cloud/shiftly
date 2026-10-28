"use client";

import { ArrowUpRight, Check, LoaderCircle, Lock, RefreshCw, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "@/components/toast";
import { Avatar, buttonClass, PayoutItemNote, PayoutItemPill } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { formatEUR, formatMinutes } from "@/lib/format";
import { statusSummary } from "@/lib/payouts/logic";
import type { BatchView } from "@/lib/payouts/view";
import { roleLabel } from "@/lib/roles";
import { checkPayoutsAction, payCrewAction } from "../../payroll/actions";

type Recipient = { workerId: number; name: string; role: Role; minutes: number; overtimeMinutes: number; amountCents: number };
type Phase = { step: "review" } | { step: "sending" } | { step: "sent"; batchId: number } | { step: "unverified"; batchId?: number; message: string } | { step: "error"; message: string };

/**
 * Two steps: "Review payouts" opens this; only "Confirm and pay" moves money.
 * Stays mounted while the job is Done or Paid so the result survives the refresh; `children` replace the trigger when nothing is payable.
 */
export function PayCrew({
  payable,
  children,
  jobId,
  subtitle,
  recipients,
  totalCents,
  minutes,
  skipped,
  batches,
}: {
  payable: boolean;
  children?: ReactNode;
  jobId: number;
  subtitle: string;
  recipients: Recipient[];
  totalCents: number;
  minutes: number;
  skipped: number;
  batches: BatchView[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ step: "review" });
  const [, start] = useTransition();
  const [checking, startCheck] = useTransition();
  const busy = phase.step === "sending";

  const open = () => {
    setPhase({ step: "review" });
    ref.current?.showModal();
  };
  const close = () => {
    if (!busy) ref.current?.close();
  };

  const confirm = () => {
    setPhase({ step: "sending" });
    start(async () => {
      try {
        const res = await payCrewAction(jobId, totalCents);
        if (res.ok) setPhase({ step: "sent", batchId: res.batchId });
        else if (res.unverified) setPhase({ step: "unverified", batchId: res.batchId, message: res.message });
        else setPhase(res.batchId ? { step: "sent", batchId: res.batchId } : { step: "error", message: res.message });
        if (!res.ok && !res.unverified) toast("error", res.message);
      } catch {
        setPhase({ step: "unverified", message: "We couldn't verify the payout response. Don't send again yet." });
      }
    });
  };

  const check = (batchId?: number) =>
    startCheck(async () => {
      const res = await checkPayoutsAction(batchId ? { batchId } : { jobId });
      toast(res.ok ? "success" : "error", res.message);
      if (res.ok && batchId) setPhase({ step: "sent", batchId });
    });

  const sent = phase.step === "sent" ? batches.find((b) => b.id === phase.batchId) : undefined;

  return (
    <>
      {payable ? (
        <button type="button" onClick={open} className={`${buttonClass.primary} h-12 w-full`}>
          <Send size={18} aria-hidden="true" /> Review payouts · {formatEUR(totalCents)}
        </button>
      ) : (
        children
      )}

      <dialog
        ref={ref}
        aria-labelledby="pay-title"
        onCancel={(e) => busy && e.preventDefault()}
        className="bg-surface text-ink m-auto max-h-[min(760px,calc(100vh-32px))] w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-xl)] p-0 shadow-[var(--shadow-dialog)] backdrop:bg-[var(--overlay)]"
      >
        <div className="flex max-h-[inherit] flex-col">
          <header className="border-line flex items-start gap-3 border-b px-7 pt-6 pb-5">
            <div className="min-w-0 flex-1">
              <h2 id="pay-title" className="flex items-center gap-2 text-[24px] leading-8 font-extrabold tracking-[-0.4px]">
                <Lock size={18} className="text-ink-muted" aria-hidden="true" />
                {phase.step === "review" ? "Pay crew" : phase.step === "sending" || sent?.open ? "Sending payouts…" : "Payout result"}
              </h2>
              <p className="text-ink-muted mt-1 text-[13px]">{subtitle}</p>
            </div>
            <span className="border-line bg-neutral-bg text-neutral-fg mt-1 inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold">
              <span className="bg-neutral-fg size-1.5 rounded-full" aria-hidden="true" /> PayPal Sandbox
            </span>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="border-line hover:bg-surface-hover grid size-10 shrink-0 place-items-center rounded-[10px] border disabled:opacity-40"
              aria-label="Close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          {phase.step === "review" || phase.step === "sending" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-7">
                <div className="border-line flex items-center justify-between border-b py-3 text-[12px]">
                  <span className="font-bold">
                    {recipients.length} {recipients.length === 1 ? "recipient" : "recipients"}
                  </span>
                  <span className="text-ink-muted">
                    Approved time: <strong className="t-number text-ink">{formatMinutes(minutes)}</strong>
                  </span>
                </div>
                <ul>
                  {recipients.map((r) => (
                    <li key={r.workerId} className="border-line flex min-h-[54px] items-center gap-3 border-b py-2 last:border-b-0">
                      <Avatar name={r.name} role={r.role} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold">{r.name}</p>
                        <p className="text-ink-muted text-[11px]">
                          {roleLabel[r.role]} · {formatMinutes(r.minutes)} approved
                          {r.overtimeMinutes > 0 && ` · ${formatMinutes(r.overtimeMinutes)} overtime`}
                        </p>
                      </div>
                      <span className="t-number text-[14px] font-semibold">{formatEUR(r.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                {skipped > 0 && (
                  <p className="text-ink-muted pb-3 text-[12px]">
                    {skipped} {skipped === 1 ? "person is" : "people are"} left out: already paid for this job or a payout is on the way.
                  </p>
                )}
              </div>
              <footer className="border-line-strong bg-surface-alt border-t-2 px-7 pt-5 pb-6">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-ink-secondary text-[11px] font-extrabold tracking-[0.8px] uppercase">Total to send</span>
                  <span className="t-number text-[26px] font-bold">{formatEUR(totalCents)}</span>
                </div>
                <p className="text-ink-muted mt-2 text-[12px]">
                  Review every recipient before you confirm. This sends PayPal Payouts in <strong className="text-ink">Sandbox mode</strong>; no real money moves.
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={close} disabled={busy} className={`${buttonClass.secondary} disabled:opacity-50`}>
                    Cancel
                  </button>
                  <button type="button" onClick={confirm} disabled={busy} className={`${buttonClass.primary} h-12 disabled:bg-neutral-bg disabled:text-neutral-fg`}>
                    {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                    {busy ? "Sending to PayPal…" : `Confirm and pay ${formatEUR(totalCents)}`}
                  </button>
                </div>
              </footer>
            </>
          ) : phase.step === "unverified" ? (
            <div className="px-7 py-6">
              <p role="alert" className="border-warning-line bg-warning-bg text-warning-fg rounded-[var(--radius-md)] border px-4 py-3 text-[13px] font-bold">
                {phase.message}
              </p>
              <p className="text-ink-muted mt-3 text-[13px]">The batch is saved. Checking re-sends it with the same PayPal request id, so PayPal can never pay it twice.</p>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={close} className={buttonClass.secondary}>
                  Close
                </button>
                <button type="button" onClick={() => check(phase.batchId)} disabled={checking} className={`${buttonClass.primary} disabled:opacity-60`}>
                  <RefreshCw size={16} className={checking ? "animate-spin" : ""} aria-hidden="true" /> Check payout status
                </button>
              </div>
            </div>
          ) : phase.step === "error" ? (
            <div className="px-7 py-6">
              <p role="alert" className="border-error-line bg-error-bg text-error-fg rounded-[var(--radius-md)] border px-4 py-3 text-[13px] font-bold">
                {phase.message}
              </p>
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={close} className={buttonClass.secondary}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <SentView batch={sent} onClose={close} />
          )}
        </div>
      </dialog>
    </>
  );
}

function SentView({ batch, onClose }: { batch: BatchView | undefined; onClose: () => void }) {
  if (!batch) {
    return (
      <p className="text-ink-muted flex items-center gap-2 px-7 py-8 text-[13px]">
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Loading batch…
      </p>
    );
  }
  const paid = batch.items.filter((i) => i.status === "SUCCESS");
  const paidCents = paid.reduce((n, i) => n + i.amountCents, 0);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-7">
        <div className="border-line border-b py-3">
          <p className="t-number-xs text-ink-muted">
            {batch.senderBatchId}
            {batch.paypalBatchId && ` · PayPal ${batch.paypalBatchId}`}
          </p>
          <p className="mt-1 text-[13px] font-bold">
            {[`${paid.length} of ${batch.items.length} paid`, statusSummary(batch.items.filter((i) => i.status !== "SUCCESS").map((i) => i.status))].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ul>
          {batch.items.map((i) => (
            <li key={i.id} className="border-line flex min-h-[54px] items-center gap-3 border-b py-2 last:border-b-0">
              <Avatar name={i.name} role={i.role} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{i.name}</p>
                <PayoutItemNote status={i.status} message={i.errorMessage} />
              </div>
              <PayoutItemPill status={i.status} />
              <span className="t-number w-[96px] text-right text-[14px] font-semibold">{formatEUR(i.amountCents)}</span>
            </li>
          ))}
        </ul>
      </div>
      <footer className="border-line-strong bg-surface-alt border-t-2 px-7 pt-5 pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-ink-secondary text-[11px] font-extrabold tracking-[0.8px] uppercase">Confirmed paid</span>
          <span className="t-number text-[22px] font-bold">
            {formatEUR(paidCents)} <span className="text-ink-muted text-[13px] font-semibold">/ {formatEUR(batch.totalCents)}</span>
          </span>
        </div>
        <p className="text-ink-muted mt-2 text-[12px]">
          {batch.open ? "Statuses update from PayPal every 20 seconds. Paid shows only after PayPal reports SUCCESS." : "PayPal has settled every item it can. Unclaimed money waits for the recipient."}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonClass.secondary}>
            Close
          </button>
          <Link href="/payroll" className={buttonClass.primary}>
            View payout batch <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </>
  );
}

/** Polls reconcile every 20 s while a batch is open on this job; pauses while the tab is hidden. */
export function PayoutWatcher({ jobId }: { jobId: number }) {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void checkPayoutsAction({ jobId });
    }, 20_000);
    return () => clearInterval(id);
  }, [jobId]);
  return null;
}
