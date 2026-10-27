// Display formatting per docs/design-system.md: amounts "€ 1.234,50", times "08:00–16:30".

export const TIME_ZONE = "Europe/Rome";

const amount = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

export function formatEUR(cents: number): string {
  return `€ ${amount.format(cents / 100)}`;
}

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

export function formatTime(d: Date): string {
  return time.format(d);
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

const dateParts = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

function parts(d: Date) {
  const p = Object.fromEntries(dateParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, day: p.day, month: p.month, year: p.year };
}

/** "Tue 22 Sep" */
export function formatDay(d: Date): string {
  const p = parts(d);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "22 Sep 2026" */
export function formatDate(d: Date): string {
  const p = parts(d);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "22–23 Sep 2026", "30 Sep – 2 Oct 2026", or a single date. */
export function formatDateRange(start: Date, end: Date): string {
  const a = parts(start);
  const b = parts(end);
  if (a.year !== b.year) return `${formatDate(start)} – ${formatDate(end)}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${formatDate(end)}`;
  if (a.day !== b.day) return `${a.day}–${formatDate(end)}`;
  return formatDate(start);
}

/** "23 Sep, 18:40" */
export function formatDateTime(d: Date): string {
  const p = parts(d);
  return `${p.day} ${p.month}, ${formatTime(d)}`;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}
