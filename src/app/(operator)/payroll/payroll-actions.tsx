"use client";

import { LoaderCircle, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { buttonClass, DemoTag, PayoutItemPill } from "@/components/ui";
import { formatEUR } from "@/lib/format";
import { checkPayoutsAction, retryFailedAction } from "./actions";

export function CheckStatusButton({ jobId, batchId, wide = false }: { jobId?: number; batchId?: number; wide?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await checkPayoutsAction(batchId ? { batchId } : { jobId });
          toast(res.ok ? "success" : "error", res.message);
        })
      }
      className={`${buttonClass.secondary} ${wide ? "w-full" : ""} disabled:opacity-60`}
    >
      <RefreshCw size={16} className={pending ? "animate-spin" : ""} aria-hidden="true" /> {pending ? "Checking…" : "Check status"}
    </button>
  );
}

const dialogClass =
  "bg-surface text-ink m-auto w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-xl)] p-0 shadow-[var(--shadow-dialog)] backdrop:bg-[var(--overlay)]";

/** Confirm step for "Retry failed": names the exact subset and total; the server re-checks PayPal before sending. */
export function RetryFailedButton({ batchId, items }: { batchId: number; items: { name: string; amountCents: number }[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const total = items.reduce((n, i) => n + i.amountCents, 0);
  const confirm = () =>
    start(async () => {
      const res = await retryFailedAction(batchId, total);
      toast(res.ok ? "success" : "error", res.message);
      ref.current?.close();
    });
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="border-error-line text-error-fg hover:bg-error-bg inline-flex h-11 items-center gap-2 rounded-[10px] border bg-[var(--surface)] px-[18px] text-[13px] font-bold"
      >
        <RotateCcw size={16} aria-hidden="true" /> Retry failed · {formatEUR(total)}
      </button>
      <dialog ref={ref} aria-labelledby={`retry-${batchId}`} onCancel={(e) => pending && e.preventDefault()} className={dialogClass}>
        <div className="px-6 pt-6 pb-5">
          <h2 id={`retry-${batchId}`} className="text-[20px] font-extrabold">
            Retry failed payouts
          </h2>
          <p className="text-ink-muted mt-1 text-[13px]">A new batch for these people only. PayPal is checked again first; anyone no longer failed is left out.</p>
          <ul className="border-line mt-4 border-y">
            {items.map((i) => (
              <li key={i.name} className="border-line flex h-11 items-center justify-between border-b text-[13px] last:border-b-0">
                <span className="font-bold">{i.name}</span>
                <span className="t-number">{formatEUR(i.amountCents)}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted mt-3 text-[12px]">PayPal Sandbox: no real money moves.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={pending} onClick={() => ref.current?.close()} className={buttonClass.secondary}>
              Cancel
            </button>
            <button type="button" disabled={pending} onClick={confirm} className={`${buttonClass.primary} disabled:bg-neutral-bg disabled:text-neutral-fg`}>
              {pending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
              {pending ? "Sending…" : `Confirm and retry ${formatEUR(total)}`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export type HistoryEntry = { id: number; date: string; job: string; batch: string; amountCents: number; status: string; transactionId: string | null; demo: boolean };

/** A person's name opens their payout history in a 420px side drawer. */
export function PersonHistory({ name, email, history }: { name: string; email: string; history: HistoryEntry[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const paid = history.filter((h) => h.status === "SUCCESS").reduce((n, h) => n + h.amountCents, 0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpened(true);
          ref.current?.showModal();
        }}
        className="t-body-strong text-left text-[13px] leading-5 underline-offset-2 hover:underline"
      >
        {name}
      </button>
      <dialog
        ref={ref}
        aria-label={`${name}: payout history`}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="bg-surface text-ink m-0 ml-auto h-dvh max-h-dvh w-[min(420px,100vw)] p-0 shadow-[var(--shadow-dialog)] backdrop:bg-[var(--overlay)]"
      >
        {opened && (
          <div className="flex h-full flex-col">
            <header className="border-line flex items-start gap-3 border-b px-6 py-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[20px] font-extrabold">{name}</h2>
                <p className="text-ink-muted text-[12px]">{email}</p>
                <p className="mt-2 text-[13px]">
                  Paid in total <strong className="t-number">{formatEUR(paid)}</strong>
                </p>
              </div>
              <button type="button" onClick={() => ref.current?.close()} className="border-line hover:bg-surface-hover grid size-10 place-items-center rounded-[10px] border" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <ol className="min-h-0 flex-1 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="border-line border-b px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-bold">{h.job}</p>
                    <span className="t-number text-[13px] font-semibold">{formatEUR(h.amountCents)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <PayoutItemPill status={h.status} />
                    {h.demo && <DemoTag />}
                    <span className="t-number-xs text-ink-muted">
                      {h.date} · {h.batch}
                    </span>
                  </div>
                  <p className="t-number-xs text-ink-muted mt-1">{h.transactionId ? `Transaction ${h.transactionId}` : h.demo ? "Sample record, never sent to PayPal" : "No transaction yet"}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </dialog>
    </>
  );
}
