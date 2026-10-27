// Wall-clock helpers for Europe/Rome. Shifts are stored as UTC instants; people think in Rome local time.

export const TZ = "Europe/Rome";

const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function offsetMinutes(at: Date): number {
  const name = offsetFmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** "2026-11-14" + "08:00" in Rome → UTC instant. "24:00" or an end before start is the caller's job. */
export function romeDateTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // Two passes handle the DST boundary.
  const first = new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
  return new Date(guess.getTime() - offsetMinutes(first) * 60_000);
}

/** Rome calendar day "YYYY-MM-DD" of an instant. */
export function romeDayKey(at: Date | number): string {
  return dayKeyFmt.format(at);
}

/** "08:00" in Rome. */
export function romeHHMM(at: Date): string {
  return hhmmFmt.format(at);
}

/** Calendar day shifted by `days`, as "YYYY-MM-DD". */
export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** UTC midnight for a @db.Date column. */
export function dateColumn(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}
