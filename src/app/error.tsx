"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div role="alert" className="border-error-line bg-surface mt-6 flex flex-col items-start gap-4 rounded-[var(--radius-lg)] border px-6 py-6 sm:flex-row sm:items-center">
      <span className="bg-error-bg text-error-fg grid size-10 shrink-0 place-items-center rounded-full">
        <CircleAlert size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="t-h3">Couldn&apos;t load this page.</h2>
        <p className="text-ink-muted mt-0.5 text-[14px]">
          Nothing was changed. The database may be unreachable; check the connection, then retry.
          {digest && <span className="t-number-xs ml-2">ref {digest}</span>}
        </p>
      </div>
      <button type="button" onClick={retry} className={buttonClass.secondary}>
        <RotateCcw size={16} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
