import Link from "next/link";

/** Two offset bars: a shift sliding into place. */
export function Wordmark() {
  return (
    <Link href="/jobs" className="flex items-center gap-2.5 rounded-md" aria-label="Shiftly home">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="4" width="13" height="5" rx="2.5" fill="var(--accent)" />
        <rect x="7" y="13" width="13" height="5" rx="2.5" fill="var(--accent)" opacity="0.55" />
      </svg>
      <span className="text-heading font-semibold tracking-[-0.02em]">shiftly</span>
    </Link>
  );
}
