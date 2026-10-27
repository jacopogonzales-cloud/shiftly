// Geometry copied from docs/design/assets (shiftly-mark.svg, shiftly-wordmark.svg).
// Inlined so the wordmark text renders in the page's Manrope instead of a fallback font.

const BARS = (
  <>
    <rect x="5" y="6" width="16" height="5" rx="2.5" fill="var(--accent)" />
    <rect x="5" y="13.5" width="22" height="5" rx="2.5" fill="var(--accent)" />
    <rect x="11" y="21" width="16" height="5" rx="2.5" fill="var(--accent)" />
  </>
);

export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      {BARS}
    </svg>
  );
}

export function Wordmark({ height = 36 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 166 36" role="img" aria-label="Shiftly" style={{ width: "auto" }}>
      <g transform="translate(0,2)">{BARS}</g>
      <text x="40" y="28" fontFamily="var(--font-manrope), Arial, sans-serif" fontWeight="800" fontSize="25" letterSpacing="-1.2" fill="var(--ink)">
        Shiftly
      </text>
    </svg>
  );
}
