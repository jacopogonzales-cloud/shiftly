import Link from "next/link";
import type { ReactNode } from "react";
import type { JobStatus, Role } from "@/generated/prisma/enums";
import { Mark } from "@/components/brand";
import { initials } from "@/lib/format";
import { roleLabel, roleTokens } from "@/lib/roles";

// --- pills: design-system.md §05 "Status pills (single semantic ladder)" ----------

export type Severity = "neutral" | "info" | "warning" | "error" | "success";

const severityClass: Record<Severity, string> = {
  neutral: "bg-neutral-bg text-neutral-fg",
  info: "bg-info-bg text-info-fg",
  warning: "bg-warning-bg text-warning-fg",
  error: "bg-error-bg text-error-fg",
  success: "bg-success-bg text-success-fg",
};

export function Pill({ severity, children, title }: { severity: Severity; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-full px-[9px] text-[11px] leading-none font-extrabold whitespace-nowrap ${severityClass[severity]}`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Data origin tag: neutral, no dot. */
export function DemoTag() {
  return (
    <span
      title="Sample history: never sent to PayPal"
      className="border-line text-neutral-fg inline-flex h-[26px] items-center rounded-full border bg-[var(--surface-alt)] px-[9px] text-[11px] leading-none font-extrabold whitespace-nowrap"
    >
      Demo data
    </span>
  );
}

const jobStatus: Record<JobStatus, { severity: Severity; label: string }> = {
  PLANNING: { severity: "neutral", label: "Planning" },
  CREW_CONFIRMED: { severity: "info", label: "Crew confirmed" },
  IN_PROGRESS: { severity: "warning", label: "In progress" },
  DONE: { severity: "warning", label: "Done · to pay" },
  PAID: { severity: "success", label: "Paid" },
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  const s = jobStatus[status];
  return <Pill severity={s.severity}>{s.label}</Pill>;
}

/** PayPal transaction_status → UI label. Raw status stays available in the tooltip. */
export function payoutItemState(status: string): { severity: Severity; label: string } {
  switch (status) {
    case "SUCCESS":
      return { severity: "success", label: "Paid" };
    case "DRAFT":
      return { severity: "neutral", label: "Not sent" };
    case "NEW":
    case "PENDING":
    case "PROCESSING":
      return { severity: "info", label: "Pending" };
    case "UNCLAIMED":
      return { severity: "warning", label: "Unclaimed" };
    case "ONHOLD":
      return { severity: "warning", label: "On hold" };
    case "FAILED":
      return { severity: "error", label: "Failed" };
    case "RETURNED":
      return { severity: "error", label: "Returned" };
    case "REFUNDED":
      return { severity: "error", label: "Refunded" };
    case "BLOCKED":
      return { severity: "error", label: "Blocked" };
    default:
      return { severity: "error", label: status.charAt(0) + status.slice(1).toLowerCase() };
  }
}

export function PayoutItemPill({ status }: { status: string }) {
  const s = payoutItemState(status);
  return (
    <Pill severity={s.severity} title={`PayPal status: ${status}`}>
      {s.label}
    </Pill>
  );
}

/** One short line under an item; PayPal's full message stays in the tooltip. */
export function PayoutItemNote({ status, message }: { status: string; message: string | null }) {
  if (!message) return null;
  const short = status === "UNCLAIMED" ? "No PayPal account yet. Sign-up link sent; returns after 30 days if unclaimed." : message;
  const tone = payoutItemState(status).severity === "error" ? "text-error-fg" : "text-ink-muted";
  return (
    <p className={`${tone} mt-0.5 line-clamp-2 max-w-[360px] text-[11px] leading-4`} title={message}>
      {short}
    </p>
  );
}

/** Batch state is computed from its items, never from batch_status alone. */
export function payoutBatchState(itemStatuses: string[]): { severity: Severity; label: string } {
  const paid = itemStatuses.filter((s) => s === "SUCCESS").length;
  if (itemStatuses.length > 0 && paid === itemStatuses.length) return { severity: "success", label: "Completed" };
  if (itemStatuses.every((s) => s === "DRAFT")) return { severity: "neutral", label: "Not sent" };
  if (itemStatuses.every((s) => s === "REJECTED")) return { severity: "error", label: "Rejected" };
  const unresolved = itemStatuses.some((s) => payoutItemState(s).severity === "info");
  if (paid > 0) return { severity: "warning", label: "Partially paid" };
  if (unresolved) return { severity: "info", label: "Processing" };
  return { severity: "error", label: "Needs attention" };
}

// --- roles & people -------------------------------------------------------------

export function RoleTag({ role }: { role: Role }) {
  return (
    <span className="text-ink-secondary inline-flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap">
      <span className="size-2 shrink-0 rounded-full" style={{ background: roleTokens[role].fg }} aria-hidden="true" />
      {roleLabel[role]}
    </span>
  );
}

export function Avatar({ name, role }: { name: string; role?: Role }) {
  const tone = role ? roleTokens[role] : { fg: "var(--neutral-fg)", bg: "var(--neutral-bg)" };
  return (
    <span
      aria-hidden="true"
      className="grid size-[30px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
      style={{ background: tone.bg, color: `color-mix(in srgb, ${tone.fg} 85%, var(--ink))` }}
    >
      {initials(name)}
    </span>
  );
}

// --- page structure -------------------------------------------------------------

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="mt-5 mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="t-eyebrow text-accent mb-2 text-[10px] tracking-[1.7px]">{eyebrow}</p>
        <h1 className="t-h1">{title}</h1>
        <p className="text-ink-muted mt-1.5 text-[14px]">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mt-5 text-[12px] font-semibold">
      <ol className="flex items-center gap-2">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            {i > 0 && <span className="text-ink-muted" aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="text-ink-muted hover:text-ink rounded-[4px]">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`border-line bg-surface overflow-hidden rounded-[var(--radius-lg)] border ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="border-line flex items-center justify-between gap-4 border-b px-6 py-[18px]">
      <div>
        <h2 className="t-h3">{title}</h2>
        {subtitle && <p className="text-ink-muted t-small mt-0.5 font-medium">{subtitle}</p>}
      </div>
      {aside && <div className="text-ink-muted t-small font-medium">{aside}</div>}
    </div>
  );
}

/** Understated metric row: hairline-separated, no heavy boxes. */
export function MetricStrip({ metrics }: { metrics: { label: string; value: ReactNode; caption: ReactNode; money?: boolean; tone?: "error" }[] }) {
  return (
    <div
      className="border-line bg-surface mb-6 grid grid-cols-2 overflow-hidden rounded-[var(--radius-lg)] border wide:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={{ "--cols": metrics.length } as React.CSSProperties}
    >
      {metrics.map((m) => (
        <div key={m.label} className="border-line min-w-0 border-r border-b px-6 py-5 last:border-r-0 wide:border-b-0 [&:nth-child(2n)]:border-r-0 wide:[&:nth-child(2n)]:border-r wide:last:border-r-0">
          <p className="text-ink-muted t-small font-bold">{m.label}</p>
          <p className={`mt-2 ${m.money ? "t-number-lg text-[24px]" : "text-[26px] leading-[34px] font-extrabold tracking-[-0.7px] tabular-nums"} ${m.tone === "error" ? "text-error-fg" : ""}`}>
            {m.value}
          </p>
          <p className="text-ink-muted mt-1 text-[12px] leading-[18px]">{m.caption}</p>
        </div>
      ))}
    </div>
  );
}

/** Table shell: surface-alt header, 11px uppercase labels, hairline rows; scrolls instead of squeezing. */
export function Table({ head, minWidth, label, children }: { head: { label: string; align?: "right"; className?: string }[]; minWidth?: number; label: string; children: ReactNode }) {
  return (
    // relative: keeps absolutely positioned bits (sr-only headers, row link overlays) inside the scroll area.
    <div className="relative overflow-x-auto">
      <table aria-label={label} className="w-full border-collapse text-left" style={{ minWidth }}>
        <thead>
          <tr className="border-line bg-surface-alt border-b">
            {head.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={`text-ink-secondary h-11 px-5 text-[11px] font-extrabold tracking-[0.65px] whitespace-nowrap uppercase ${h.align === "right" ? "text-right" : ""} ${h.className ?? ""}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-line [&>tr]:border-b [&>tr:last-child]:border-b-0 [&>tr:hover]:bg-surface-hover/60 [&_td]:px-5">{children}</tbody>
      </table>
    </div>
  );
}

export function TableFootnote({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="text-ink-muted flex flex-wrap justify-between gap-2 px-1 pt-4 text-[12px]">
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <div className="border-line bg-surface mb-5 grid size-14 place-items-center rounded-[var(--radius-md)] border">
        <Mark size={30} />
      </div>
      <h2 className="t-h2">{title}</h2>
      <p className="text-ink-muted mt-2 max-w-md text-[14px]">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export const buttonClass = {
  primary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-[18px] text-[13px] font-bold text-ink-inverse transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-[18px] text-[13px] font-bold text-ink transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover active:bg-surface-pressed",
  quiet:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-[18px] text-[13px] font-bold text-ink-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover",
};

// --- loading ------------------------------------------------------------------------

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Skeleton rows that keep the finished table's geometry. */
export function TableSkeleton({ rows = 5, rowHeight = 76, columns }: { rows?: number; rowHeight?: number; columns: string[] }) {
  return (
    <Card aria-busy="true">
      <div className="bg-surface-alt border-line flex h-11 items-center gap-6 border-b px-5">
        {columns.map((w, i) => (
          <div key={i} className="skeleton h-2.5" style={{ width: `calc(${w} * 0.6)` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="border-line flex items-center gap-6 border-b px-5 last:border-b-0" style={{ height: rowHeight }}>
          {columns.map((w, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: w }} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </Card>
  );
}

export function MetricStripSkeleton({ count }: { count: number }) {
  return (
    <div className="border-line bg-surface mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border wide:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": count } as React.CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 px-6 py-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}
