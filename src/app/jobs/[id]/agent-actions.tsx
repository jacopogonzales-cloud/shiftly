"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { buttonClass } from "@/components/ui";
import { planJobAction } from "../actions";

export function PlanButton({ jobId, label = "Plan with AI", wide = false }: { jobId: number; label?: string; wide?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await planJobAction(jobId);
          toast(res.ok ? "success" : "error", res.message);
        })
      }
      className={`${buttonClass.primary} ${wide ? "h-12 w-full" : ""} disabled:bg-neutral-bg disabled:text-neutral-fg`}
    >
      {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
      {pending ? "Planning crew…" : label}
    </button>
  );
}
