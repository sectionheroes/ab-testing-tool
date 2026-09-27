/**
 * Day boundaries in the shop's timezone (contract 4.8: day boundaries are in `Shop.timezone`, not UTC).
 *
 * Pure – no DB, no Prisma – so the DST cases can be tested without a database. Used by stats.server.ts to turn a
 * tainted day (ADR-0026) into the UTC half-open interval [from, to) it covers. Expressing it as a range instead of a
 * per-row `to_char(... AT TIME ZONE ...)` is what keeps the million-row aggregate inside its 500 ms budget: the
 * comparison stays sargable, the string conversion would have to run once per exposure.
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
