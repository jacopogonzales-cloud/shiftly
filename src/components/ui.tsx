import type { ReactNode } from "react";
import type { JobStatus, Role } from "@/generated/prisma/enums";

// --- pills: docs/design-system.md §3 -----------------------------------------

export type Tone = "neutral" | "info" | "accent" | "warn" | "ok" | "err";

const toneClass: Record<Tone, string> = {
  neutral: "text-text-2 border-line",
  info: "text-info border-info/30",
  accent: "text-accent border-accent/30",
  warn: "text-warn border-warn/30",
  ok: "text-ok border-ok/30",
  err: "text-err border-err/30",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${toneClass[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

const jobStatus: Record<JobStatus, { tone: Tone; label: string }> = {
  PLANNING: { tone: "neutral", label: "Planning" },
  CREW_CONFIRMED: { tone: "info", label: "Crew confirmed" },
  IN_PROGRESS: { tone: "accent", label: "In progress" },
  DONE: { tone: "warn", label: "Done · to pay" },
  PAID: { tone: "ok", label: "Paid" },
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  const s = jobStatus[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** PayPal batch_status / transaction_status, plus our own DRAFT. */
export function payoutTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "SUCCESS":
      return { tone: "ok", label: "Paid" };
    case "UNCLAIMED":
      return { tone: "neutral", label: "Unclaimed" };
    case "DRAFT":
      return { tone: "neutral", label: "Draft" };
    case "PENDING":
    case "PROCESSING":
    case "NEW":
    case "ONHOLD":
      return { tone: "neutral", label: "Pending" };
    default:
      return { tone: "err", label: status.charAt(0) + status.slice(1).toLowerCase() };
  }
}

export function PayoutPill({ status }: { status: string }) {
  const s = payoutTone(status);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** Seeded history that never went through PayPal. */
export function DemoTag() {
  return (
    <span
      title="Seeded history: these IDs were never sent to PayPal"
      className="border-line text-text-3 inline-flex rounded-[5px] border border-dashed px-1.5 py-px font-mono text-[10px] font-medium tracking-[0.08em] whitespace-nowrap uppercase"
    >
      Demo data
    </span>
  );
}

// --- roles ---------------------------------------------------------------------

export const roleColor: Record<Role, string> = {
  MONTATORE: "var(--role-montatore)",
  ELETTRICISTA: "var(--role-elettricista)",
  RIGGER: "var(--role-rigger)",
  AUTISTA: "var(--role-autista)",
};

export function RoleTag({ role }: { role: Role }) {
  return (
    <span className="text-text-2 inline-flex items-center gap-2 text-[13px]">
      <span className="size-2 rounded-[3px]" style={{ background: roleColor[role] }} aria-hidden="true" />
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

// --- layout pieces -------------------------------------------------------------------

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-title">{title}</h1>
      {children}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border-line bg-bg-1 rounded-card border ${className}`}>{children}</section>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="label">{label}</p>
      <p className="num mt-2 text-[22px]">{value}</p>
      {hint && <p className="text-text-3 mt-1 text-[13px]">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <div className="border-line bg-bg-2 text-text-2 mb-5 grid size-12 place-items-center rounded-full border [&>svg]:size-6">{icon}</div>
      <h2 className="text-heading">{title}</h2>
      <p className="text-text-2 mt-2 max-w-md text-[14px] leading-relaxed">{children}</p>
    </Card>
  );
}

/** Table shell: horizontal scroll on narrow screens, hairline rows, hover row. */
export function Table({ head, children }: { head: { label: string; align?: "right" }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-line border-b">
            {head.map((h) => (
              <th key={h.label} scope="col" className={`label px-5 py-3 font-medium whitespace-nowrap ${h.align === "right" ? "text-right" : ""}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-line [&>tr:hover]:bg-bg-2/60 [&>tr]:border-b [&>tr:last-child]:border-b-0 [&_td]:px-5 [&_td]:py-3.5">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" className="border-line bg-bg-1 rounded-card border">
      <div className="border-line border-b px-5 py-3.5">
        <div className="skeleton h-3 w-40" />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="border-line flex gap-6 border-b px-5 py-4 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skeleton h-4 flex-1" style={{ maxWidth: c === 0 ? 220 : 120 }} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
