"use client";

import { CalendarDays, Settings2, UsersRound, WalletCards, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/jobs", label: "Jobs", icon: CalendarDays },
  { href: "/crew", label: "Crew", icon: UsersRound },
  { href: "/payroll", label: "Payroll", icon: WalletCards },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

/** Rail nav: full labels at ≥1200px, icons with tooltips at 768–1199px, horizontal strip below 768px. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1.5 overflow-x-auto md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-11 shrink-0 items-center gap-3 rounded-[10px] px-4 text-[13px] font-bold transition-colors duration-[var(--duration-fast)] md:justify-center md:px-0 wide:justify-start wide:px-4 ${
              active
                ? "bg-surface text-ink shadow-[0_1px_3px_#15201808] before:absolute before:top-[13px] before:left-0 before:h-[18px] before:w-[3px] before:rounded-r before:bg-accent"
                : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" className={active ? "text-ink" : "text-ink-muted"} />
            <span className="md:sr-only wide:not-sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
