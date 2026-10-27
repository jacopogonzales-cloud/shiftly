"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

// Minimal toasts per design-system.md §05: top-right, verb-first, success 4s, info 6s, errors stay until dismissed.

type Tone = "success" | "info" | "error";
type Toast = { id: number; tone: Tone; text: string };

let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

export function toast(tone: Tone, text: string) {
  const t = { id: nextId++, tone, text };
  listeners.forEach((l) => l(t));
}

const toneStyle: Record<Tone, { cls: string; Icon: typeof Info }> = {
  success: { cls: "border-success-line text-success-fg", Icon: CircleCheck },
  info: { cls: "border-info-line text-info-fg", Icon: Info },
  error: { cls: "border-error-line text-error-fg", Icon: CircleAlert },
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((list) => [...list, t]);
      if (t.tone !== "error") setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.tone === "success" ? 4000 : 6000);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((t) => {
        const { cls, Icon } = toneStyle[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`bg-surface pointer-events-auto flex min-h-[52px] items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 shadow-[var(--shadow-popover)] ${cls}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-ink flex-1 text-[13px] leading-5 font-semibold">{t.text}</p>
            <button type="button" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} className="text-ink-muted hover:text-ink -m-1 grid size-7 place-items-center rounded-[6px]" aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
