"use client";

import { Check, Copy, LoaderCircle, Play, Send, Sparkles } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "@/components/toast";
import { buttonClass } from "@/components/ui";
import { planJobAction, sendRequestsAction, startJobAction, type ActionResult } from "../actions";

function ActionButton({
  run,
  label,
  pendingLabel,
  icon,
  wide = false,
}: {
  run: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  icon: ReactNode;
  wide?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await run();
          toast(res.ok ? "success" : "error", res.message);
        })
      }
      className={`${buttonClass.primary} ${wide ? "h-12 w-full" : ""} disabled:bg-neutral-bg disabled:text-neutral-fg`}
    >
      {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : icon}
      {pending ? pendingLabel : label}
    </button>
  );
}

export function PlanButton({ jobId, label = "Plan with AI", wide = false }: { jobId: number; label?: string; wide?: boolean }) {
  return <ActionButton run={() => planJobAction(jobId)} label={label} pendingLabel="Planning crew…" icon={<Sparkles size={18} aria-hidden="true" />} wide={wide} />;
}

export function SendRequestsButton({ jobId, count }: { jobId: number; count: number }) {
  return (
    <ActionButton
      run={() => sendRequestsAction(jobId)}
      label={`Send availability requests (${count})`}
      pendingLabel="Writing and sending requests…"
      icon={<Send size={18} aria-hidden="true" />}
      wide
    />
  );
}

export function StartJobButton({ jobId }: { jobId: number }) {
  return <ActionButton run={() => startJobAction(jobId)} label="Start job" pendingLabel="Starting…" icon={<Play size={18} aria-hidden="true" />} wide />;
}

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-ink-secondary hover:bg-surface-hover hover:text-ink grid size-10 place-items-center rounded-[10px]"
      aria-label={copied ? "Link copied" : "Copy invitation link"}
      title={copied ? "Copied" : "Copy link"}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}
