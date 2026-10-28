import Link from "next/link";
import { Suspense } from "react";
import { Mark, Wordmark } from "@/components/brand";
import { CompanyBadge, CompanyBadgeView } from "@/components/company-name";
import { NavLinks, NavList } from "@/components/nav-links";

/** Operator workspace: left rail + content. Public pages (e.g. /confirm) live outside this group. */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[var(--rail-w-compact)_minmax(0,1fr)] wide:grid-cols-[var(--rail-w)_minmax(0,1fr)]">
      <a
        href="#main"
        className="bg-surface text-ink sr-only z-50 rounded-[10px] px-4 py-3 text-[13px] font-bold shadow-[var(--shadow-popover)] focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="border-line bg-surface-alt flex flex-col gap-4 border-b px-4 py-4 md:sticky md:top-0 md:h-dvh md:gap-0 md:border-r md:border-b-0 md:px-3 md:pt-7 md:pb-6 wide:px-3.5">
        <Link href="/jobs" aria-label="Shiftly, go to Jobs" className="flex items-center rounded-[10px] md:justify-center wide:justify-start wide:px-3">
          <span className="md:hidden wide:block">
            <Wordmark height={36} />
          </span>
          <Mark size={30} className="hidden md:block wide:hidden" />
        </Link>

        <p className="t-eyebrow text-ink-muted mt-[52px] mb-3 hidden px-[15px] text-[10px] wide:block">Workspace</p>
        <div className="md:mt-[52px] wide:mt-0">
          <Suspense fallback={<NavList pathname={null} />}>
            <NavLinks />
          </Suspense>
        </div>

        <div className="border-line mt-auto hidden border-t pt-[22px] md:block wide:px-2">
          <Suspense fallback={<CompanyBadgeView name="" loading />}>
            <CompanyBadge />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="px-6 pt-8 pb-14 wide:px-8 min-[1440px]:px-10">
          <div className="flex h-[33px] items-center justify-end gap-3">
            <span className="bg-neutral-bg text-neutral-fg rounded-[7px] px-2.5 py-1.5 text-[10px] leading-none font-extrabold tracking-[0.45px] uppercase">
              Sandbox
            </span>
          </div>
          <main id="main" tabIndex={-1} className="focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
