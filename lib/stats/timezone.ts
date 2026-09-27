/**
 * Day boundaries in the shop's timezone (contract 4.8: day boundaries are in `Shop.timezone`, not UTC).
 *
 * Pure – no DB, no Prisma – so the DST cases can be tested without a database. Two callers need exactly this:
 * `stats.server.ts` turns a tainted day (ADR-0026) and every day of the 4.9 time series into the UTC half-open
 * interval it covers, and `evaluate()` counts the calendar days and week boundaries of the stopping rule (ADR-0036)
 * in the shop's timezone. It lives in lib/stats so both share one implementation; app/services/timezone.ts re-exports
 * it for its older callers.
 *
 * Expressing a day as a range instead of a per-row `to_char(... AT TIME ZONE ...)` is what keeps the million-row
 * aggregate inside its 500 ms budget: the comparison stays sargable, the string conversion would have to run once per
 * exposure (WP4, plan WP4.1 trap 2).
 */

/** Offset of `tz` at that instant, in milliseconds (positive east of Greenwich). */
export function timezoneOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // hourCycle h23 still renders midnight as "24" in some ICU versions.
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The UTC interval [from, to) covered by the local calendar day `YYYY-MM-DD` in `tz`.
 *
 * The offset is resolved twice: once from the naive guess, once from the corrected instant. That second pass is what
 * gets the days right on which the clocks move – a 23-hour or 25-hour day comes back with the right length.
 */
export function localDayRangeUtc(day: string, tz: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`localDayRangeUtc: expected YYYY-MM-DD, got ${day}`);
  const [, y, m, d] = match.map(Number);

  const resolve = (utcMidnight: number) => {
    let instant = utcMidnight - timezoneOffsetMs(new Date(utcMidnight), tz);
    instant = utcMidnight - timezoneOffsetMs(new Date(instant), tz);
    return new Date(instant);
  };
  return { from: resolve(Date.UTC(y, m - 1, d)), to: resolve(Date.UTC(y, m - 1, d + 1)) };
}

/** The local calendar day of an instant in `tz`, as YYYY-MM-DD. */
export function localDayString(at: Date, tz: string): string {
  const shifted = new Date(at.getTime() + timezoneOffsetMs(at, tz));
  return shifted.toISOString().slice(0, 10);
}

/** Adds `days` calendar days to a YYYY-MM-DD string. Pure date arithmetic – no timezone involved. */
export function addDays(day: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`addDays: expected YYYY-MM-DD, got ${day}`);
  const [, y, m, d] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) throw new Error(`daysBetween: expected YYYY-MM-DD, got ${day}`);
    const [, y, m, d] = match.map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** Every calendar day from `from` to `to` inclusive, as YYYY-MM-DD. */
export function dayRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}
