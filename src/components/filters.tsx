"use client";

import { Search } from "lucide-react";

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="border-line bg-surface text-ink-muted focus-within:outline-focus-ring flex h-[42px] w-full items-center gap-2.5 rounded-[9px] border px-3.5 focus-within:outline-2 focus-within:outline-offset-2 sm:w-80">
      <Search size={15} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-ink placeholder:text-ink-muted h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      />
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-[42px] items-center gap-1 overflow-x-auto rounded-[11px] bg-[var(--surface-pressed)]/60 p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`h-[34px] shrink-0 rounded-[8px] px-3.5 text-[12px] font-bold whitespace-nowrap transition-colors duration-[var(--duration-fast)] ${
              selected ? "bg-surface text-ink shadow-[0_1px_3px_#14201912]" : "text-ink-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
