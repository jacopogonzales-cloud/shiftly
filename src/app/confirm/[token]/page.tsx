import { CalendarDays, Clock3, HardHat, Lock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { Skeleton } from "@/components/ui";
import { formatDay, formatTimeRange } from "@/lib/format";
import { loadInvitation } from "@/lib/invitations/invitations";
import { roleLabel } from "@/lib/roles";
import { romeDayKey } from "@/lib/time";
import { ConfirmActions } from "./confirm-actions";

// Public, tokenized, mobile-first (screens.md §04). No rail, no other crew, no amounts.

export const metadata: Metadata = { title: "Shift invitation", robots: { index: false, follow: false } };

export default function ConfirmPage({ params }: PageProps<"/confirm/[token]">) {
  return (
    <div className="bg-canvas min-h-dvh px-5 py-8">
      <div className="mx-auto max-w-[440px]">
        <div className="flex flex-col items-center gap-2">
          <Wordmark height={34} />
        </div>
        <Suspense fallback={<CardSkeleton />}>
          <Invitation params={params} />
        </Suspense>
        <p className="text-ink-muted mt-8 flex items-center justify-center gap-1.5 text-[11px]">
          <Lock size={12} aria-hidden="true" /> This invitation is personal. Don&apos;t forward this link.
        </p>
      </div>
    </div>
  );
}

async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadInvitation(token);

  if (inv.state === "inactive" || !("title" in inv)) {
    return (
      <>
        <p className="text-ink-muted mt-2 text-center text-[12px]">Shift invitation</p>
        <section className="border-line bg-surface mt-6 rounded-[var(--radius-xl)] border p-6 text-center">
          <h1 className="text-[20px] leading-7 font-extrabold tracking-[-0.4px]">This invitation link is no longer active.</h1>
          <p className="text-ink-muted mt-2 text-[14px]">It may have expired or been replaced. Contact the operator who sent it.</p>
        </section>
      </>
    );
  }

  const days = [...new Set(inv.shifts.map((s) => romeDayKey(s.startsAt)))];
  const first = inv.shifts[0].startsAt;
  const last = inv.shifts.at(-1)!.startsAt;
  const dateLine = days.length === 1 ? formatDay(first) : `${formatDay(first)} – ${formatDay(last)}`;
  const year = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/Rome" }).format(last);
  // Same windows every day → "08:00–12:30, 13:30–18:00 each day"; otherwise one line per day.
  const windowsByDay = days.map((d) => inv.shifts.filter((s) => romeDayKey(s.startsAt) === d).map((s) => formatTimeRange(s.startsAt, s.endsAt)).join(", "));
  const sameEveryDay = windowsByDay.every((w) => w === windowsByDay[0]);
  const breaks = inv.shifts.some((s) => s.breakMinutes > 0)
    ? `${Math.max(...inv.shifts.map((s) => s.breakMinutes))} min unpaid break`
    : inv.shifts.length > days.length
      ? "Unpaid break between shifts"
      : null;
  const roles = [...new Set(inv.shifts.map((s) => roleLabel[s.role]))].join(", ");
  const deadline = `${formatDay(inv.respondBy)} at ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(inv.respondBy)}`;

  return (
    <>
      <p className="text-ink-muted mt-2 text-center text-[12px]">Invitation from {inv.company}</p>
      <section className="border-line bg-surface mt-6 rounded-[var(--radius-xl)] border p-6" aria-labelledby="invite-title">
        <p className="t-eyebrow text-accent text-[10px] tracking-[1.4px]">Your shift invitation</p>
        <h1 id="invite-title" className="mt-2 text-[24px] leading-[30px] font-extrabold tracking-[-0.6px]">
          {inv.title}
        </h1>

        <ConfirmActions token={token} initial={inv.state} deadline={deadline} firstName={inv.firstName}>
          {inv.message && <p className="text-ink-secondary border-line mt-5 border-t pt-5 text-[14px] leading-[22px]">{inv.message}</p>}
          <dl className="border-line mt-5 space-y-4 border-t pt-5">
            <Detail icon={<CalendarDays size={16} />} label="Dates">
              {dateLine} {year}
            </Detail>
            <Detail icon={<MapPin size={16} />} label="Location">
              {inv.site}
            </Detail>
            <Detail icon={<Clock3 size={16} />} label="Your shift">
              {sameEveryDay ? (
                <>
                  <span className="t-number text-[14px] font-semibold">{windowsByDay[0]}</span>
                  {days.length > 1 && " each day"}
                </>
              ) : (
                days.map((d, i) => (
                  <span key={d} className="block">
                    {formatDay(new Date(`${d}T12:00:00Z`))} · <span className="t-number text-[14px] font-semibold">{windowsByDay[i]}</span>
                  </span>
                ))
              )}
              {breaks && <span className="text-ink-secondary block text-[13px] font-semibold">{breaks}</span>}
            </Detail>
            <Detail icon={<HardHat size={16} />} label="Your role">
              {roles}
            </Detail>
          </dl>
        </ConfirmActions>
      </section>
      <p className="text-ink-muted mt-6 text-center text-[13px]">
        Questions about your shift? Contact {inv.company}.
      </p>
    </>
  );
}

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="bg-surface-alt text-ink-secondary grid size-9 shrink-0 place-items-center rounded-[10px]" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt className="text-ink-muted text-[11px] font-semibold uppercase tracking-[0.6px]">{label}</dt>
        <dd className="mt-0.5 text-[14px] leading-[21px] font-bold">{children}</dd>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <section className="border-line bg-surface mt-12 space-y-4 rounded-[var(--radius-xl)] border p-6" aria-busy="true">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-12 w-full rounded-[10px]" />
      <Skeleton className="h-12 w-full rounded-[10px]" />
      <span className="sr-only">Loading invitation…</span>
    </section>
  );
}
