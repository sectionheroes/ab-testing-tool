/**
 * Re-export of the pure timezone helpers, which live in `lib/stats/timezone.ts` since WP4.1: `evaluate()` needs the
 * same calendar-day arithmetic for the stopping rule (ADR-0036) that the aggregation needs for tainted days and the
 * 4.9 day dimension, and lib/ must not import from app/ (plan §2). One implementation, two callers.
 */
export { addDays, dayRange, daysBetween, localDayRangeUtc, localDayString, timezoneOffsetMs } from "../../lib/stats/timezone";
