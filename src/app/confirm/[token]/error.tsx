"use client";

import { RotateCcw } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui";

export default function ConfirmError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="bg-canvas min-h-dvh px-5 py-8">
      <main className="mx-auto max-w-[440px] text-center">
        <div className="flex justify-center">
          <Wordmark height={34} />
        </div>
        <section role="alert" className="border-line bg-surface mt-8 rounded-[var(--radius-xl)] border p-6">
          <h1 className="text-[20px] leading-7 font-extrabold tracking-[-0.4px]">Couldn&apos;t load your invitation.</h1>
          <p className="text-ink-muted mt-2 text-[14px]">Nothing was sent. Check your connection and try again.</p>
          <button type="button" onClick={retry} className={`${buttonClass.secondary} mt-5 h-12 w-full`}>
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        </section>
      </main>
    </div>
  );
}
