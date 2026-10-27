"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const items: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/jobs",
    label: "Jobs",
    icon: (
      <svg viewBox="0 0 20 20" {...stroke}>
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" />
      </svg>
    ),
  },
  {
    href: "/crew",
    label: "Crew",
    icon: (
      <svg viewBox="0 0 20 20" {...stroke}>
        <circle cx="7.5" cy="7" r="2.75" />
        <path d="M2.5 16c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
        <circle cx="14" cy="7.5" r="2.25" />
        <path d="M13 12.1c2.1-.2 3.9.9 4.5 3.4" />
      </svg>
    ),
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: (
      <svg viewBox="0 0 20 20" {...stroke}>
        <rect x="2.5" y="5" width="15" height="10" rx="2" />
        <circle cx="10" cy="10" r="2.25" />
        <path d="M5.5 10h.01M14.5 10h.01" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 20 20" {...stroke}>
        <path d="M4 5.5h7M15 5.5h1M4 10h2M10 10h6M4 14.5h8M16 14.5h0" />
        <circle cx="13" cy="5.5" r="1.75" />
        <circle cx="8" cy="10" r="1.75" />
        <circle cx="14" cy="14.5" r="1.75" />
      </svg>
    ),
  },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${
              active ? "bg-bg-2 text-text" : "text-text-2 hover:bg-bg-1 hover:text-text"
            }`}
          >
            <span className={`size-[18px] shrink-0 ${active ? "text-accent" : ""}`}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
