/**
 * ADR-0036, condition by condition. The cases the acceptance list of WP4.1 names explicitly are marked.
 */
import { describe, expect, it } from "vitest";
import {
  conversionsForMde,
  evaluateStoppingRule,
  FUTILITY_DAYS,
  mdeFromConversions,
  sampleSize,
  visitorsForConversions,
  type StoppingRuleConditionKey,
} from "../index";

const TZ = "Europe/Berlin";
/** 2026-09-02 is a Wednesday – the acceptance case for "week boundaries from the start date, not from Monday". */
const WEDNESDAY = new Date("2026-09-02T10:00:00Z");

const run = (over: Partial<Parameters<typeof evaluateStoppingRule>[0]> = {}) =>
  evaluateStoppingRule({
    minConversionsPerArm: 1_000,
    minDurationDays: 14,
    requireFullWeeks: true,
    startedAt: WEDNESDAY,
    now: WEDNESDAY,
    timezone: TZ,
    convertersPerArm: [0, 0],
    ...over,
  });

const condition = (r: ReturnType<typeof run>, key: StoppingRuleConditionKey) => r.conditions.find((c) => c.key === key)!;
/** `days` calendar days after the start, same time of day. */
const dayN = (n: number) => new Date(WEDNESDAY.getTime() + n * 86_400_000);

describe("the three conditions", () => {
  it("defaults are 1000 conversions per arm, 14 days, full weeks on", () => {
    const r = run();
    expect(r.minConversionsPerArm).toBe(1_000);
    expect(r.minDurationDays).toBe(14);
    expect(r.requireFullWeeks).toBe(true);
    expect(r.configured).toBe(true);
    expect(r.met).toBe(false);
  });

  it("compares the conversions against the SLOWEST arm, not the total or the average", () => {
    const r = run({ convertersPerArm: [1_400, 900], now: dayN(14) });
    expect(r.converterFloor).toBe(900);
    expect(condition(r, "minConversionsPerArm").met).toBe(false);
    expect(r.met).toBe(false);
  });

  it("is met when all three are met", () => {
    const r = run({ convertersPerArm: [1_100, 1_050], now: dayN(14) });
    expect(r.conditions.every((c) => c.met)).toBe(true);
    expect(r.met).toBe(true);
    expect(r.evaluableOn).toBe("2026-09-16");
  });

  it("acceptance: 1000 conversions after 8 days → not met, conversions met, evaluableOn is day 14", () => {
    const r = run({ convertersPerArm: [1_000, 1_000], now: dayN(8) });
    expect(condition(r, "minConversionsPerArm").met).toBe(true);
    expect(condition(r, "minDurationDays").met).toBe(false);
    expect(condition(r, "requireFullWeeks").met).toBe(false);
    expect(r.met).toBe(false);
    expect(r.evaluableOn).toBe("2026-09-16"); // 2 Sept + 14 days
  });

  it("acceptance: every condition off → never met, and that is reported as not configured", () => {
    const r = run({
      minConversionsPerArm: null,
      minDurationDays: null,
      requireFullWeeks: false,
      convertersPerArm: [100_000, 100_000],
      now: dayN(365),
    });
    expect(r.configured).toBe(false);
    expect(r.met).toBe(false);
    expect(r.evaluableOn).toBeNull();
    expect(r.conditions.every((c) => !c.enabled)).toBe(true);
  });

  it("a single condition is enough to gate, the other two off", () => {
    const only = { minConversionsPerArm: 1_000, minDurationDays: null, requireFullWeeks: false };
    expect(run({ ...only, convertersPerArm: [999, 1_000], now: dayN(3) }).met).toBe(false);
    expect(run({ ...only, convertersPerArm: [1_000, 1_000], now: dayN(3) }).met).toBe(true);
  });

  it("an experiment that never started is never met", () => {
    const r = run({ startedAt: null, convertersPerArm: [5_000, 5_000] });
    expect(r.elapsedDays).toBeNull();
    expect(r.met).toBe(false);
  });
});

describe("full weeks count from startedAt, never from Monday", () => {
  it("acceptance: a Wednesday start puts the boundaries on day 7, 14 and 21", () => {
    const rule = { minConversionsPerArm: null, minDurationDays: null, requireFullWeeks: true };
    const metOn = (n: number) => run({ ...rule, now: dayN(n) }).met;
    // Day 0 is not a full week; 1–6 are not; 7, 14, 21 are.
    expect([0, 1, 2, 3, 4, 5, 6, 8, 13, 15, 20].every((n) => metOn(n) === false)).toBe(true);
    expect([7, 14, 21].every((n) => metOn(n) === true)).toBe(true);
  });

  it("the Monday after a Wednesday start (day 5) is NOT a boundary", () => {
    const monday = dayN(5);
    expect(monday.getUTCDay()).toBe(1); // sanity: it really is a Monday
    expect(run({ minConversionsPerArm: null, minDurationDays: null, requireFullWeeks: true, now: monday }).met).toBe(false);
  });

  it("pushes evaluableOn to the next boundary when the other conditions land mid-week", () => {
    // Duration 10 days: day 10 is not a multiple of 7, so the verdict waits for day 14.
    const r = run({ minConversionsPerArm: null, minDurationDays: 10, requireFullWeeks: true, now: dayN(3) });
    expect(condition(r, "minDurationDays").endsOn).toBe("2026-09-12"); // day 10
    expect(condition(r, "requireFullWeeks").endsOn).toBe("2026-09-16"); // day 14
    expect(r.evaluableOn).toBe("2026-09-16");
  });

  it("survives the DST change: a 25-hour day is still one calendar day", () => {
    // Europe/Berlin falls back on 25 October 2026. Start on the 24th, evaluate on the 26th.
    const r = evaluateStoppingRule({
      minConversionsPerArm: null,
      minDurationDays: 2,
      requireFullWeeks: false,
      startedAt: new Date("2026-10-24T10:00:00Z"),
      now: new Date("2026-10-26T10:00:00Z"),
      timezone: TZ,
      convertersPerArm: [0, 0],
    });
    expect(r.elapsedDays).toBe(2);
    expect(r.met).toBe(true);
  });

  it("counts the day in the SHOP's timezone, not UTC", () => {
    // 22:30 UTC on 1 October is already 2 October in Berlin: one day elapsed there, zero in UTC.
    const at = (tz: string) =>
      evaluateStoppingRule({
        minConversionsPerArm: null,
        minDurationDays: 1,
        requireFullWeeks: false,
        startedAt: new Date("2026-10-01T10:00:00Z"),
        now: new Date("2026-10-01T22:30:00Z"),
        timezone: tz,
        convertersPerArm: [0, 0],
      });
    expect(at(TZ).elapsedDays).toBe(1);
    expect(at(TZ).met).toBe(true);
    expect(at("UTC").elapsedDays).toBe(0);
    expect(at("UTC").met).toBe(false);
  });
});

describe("evaluableOn – the projection", () => {
  it("projects the conversion date from the pace so far", () => {
    // 250 conversions in the slower arm after 7 days ≈ 35.7/day → 1000 needs 28 days.
    const r = run({ minDurationDays: null, requireFullWeeks: false, convertersPerArm: [300, 250], now: dayN(7) });
    expect(condition(r, "minConversionsPerArm").endsOn).toBe("2026-09-30"); // 2 Sept + 28 days
    expect(r.evaluableOn).toBe("2026-09-30");
  });

  it("has no date to give before the first conversion, and says so with null rather than a guess", () => {
    const r = run({ minDurationDays: null, requireFullWeeks: false, convertersPerArm: [0, 0], now: dayN(3) });
    expect(condition(r, "minConversionsPerArm").endsOn).toBeNull();
    expect(r.evaluableOn).toBeNull();
    expect(r.futility).toBe(false); // no pace, no futility verdict
  });

  it("is today once the rule is met", () => {
    const r = run({ convertersPerArm: [2_000, 2_000], now: dayN(21) });
    expect(r.met).toBe(true);
    expect(r.evaluableOn).toBe("2026-09-23");
  });

  it("is the LATEST of the three end dates", () => {
    // Conversions land on day 28, duration on day 14 → the later one wins, then rounded to a week boundary (day 28).
    const r = run({ convertersPerArm: [250, 250], now: dayN(7) });
    expect(r.evaluableOn).toBe("2026-09-30");
    expect(condition(r, "minDurationDays").endsOn).toBe("2026-09-16");
  });
});

describe("futility (ADR-0036) – a warning, never an action", () => {
  it("fires when the projection is more than six weeks out", () => {
    // 20 conversions in 7 days ≈ 2.9/day → 1000 needs ~350 days.
    const r = run({ convertersPerArm: [30, 20], now: dayN(7) });
    expect(r.futility).toBe(true);
    expect(FUTILITY_DAYS).toBe(42);
  });

  it("stays quiet at exactly six weeks", () => {
    const r = run({ minConversionsPerArm: null, minDurationDays: FUTILITY_DAYS, requireFullWeeks: false, now: dayN(1) });
    expect(condition(r, "minDurationDays").endsOn).toBe("2026-10-14"); // day 42
    expect(r.futility).toBe(false);
  });

  it("never stops anything: a futile experiment is still not met and still not significant on its own", () => {
    const r = run({ convertersPerArm: [30, 20], now: dayN(7) });
    expect(r.met).toBe(false);
    expect(r.futility).toBe(true);
  });
});

describe("the calculator, both ways (ADR-0036)", () => {
  it("acceptance: MDE 12.5 % and 1000 conversions per arm agree within 2 %", () => {
    const conversions = conversionsForMde({ mde: 0.125 });
    const mde = mdeFromConversions({ conversionsPerArm: 1_000 });
    expect(conversions).toBe(1_005);
    expect(mde).toBeCloseTo(0.1253, 4);
    expect(Math.abs(mde / 0.125 - 1)).toBeLessThan(0.02);
    expect(Math.abs(conversions / 1_000 - 1)).toBeLessThan(0.02);
  });

  it("round-trips in both directions, up to the integer rounding of the conversion count", () => {
    for (const mde of [0.05, 0.1, 0.125, 0.2, 0.4]) {
      const c = conversionsForMde({ mde });
      // conversionsForMde rounds up, so the recovered MDE is a hair smaller. Relative, not absolute: at mde 0.4 the
      // count is 99 and one conversion is already 1 % of it.
      expect(mdeFromConversions({ conversionsPerArm: c })).toBeLessThanOrEqual(mde);
      expect(Math.abs(mdeFromConversions({ conversionsPerArm: c }) / mde - 1)).toBeLessThan(0.01);
    }
    for (const c of [100, 250, 1_000, 5_000]) {
      const mde = mdeFromConversions({ conversionsPerArm: c });
      expect(conversionsForMde({ mde })).toBeCloseTo(c, 0);
    }
  });

  it("reproduces the ADR's own worked figure: 1000 conversions per arm ≈ 12.5 % relative MDE", () => {
    expect(mdeFromConversions({ conversionsPerArm: 1_000 })).toBeGreaterThan(0.12);
    expect(mdeFromConversions({ conversionsPerArm: 1_000 })).toBeLessThan(0.13);
  });

  it("is shop-independent, which is the whole reason for counting conversions instead of visitors", () => {
    // Same conversion target, wildly different shop CRs: the detectable effect does not move.
    const mde = mdeFromConversions({ conversionsPerArm: 1_000 });
    expect(visitorsForConversions(1_000, 0.01)).toBe(100_000);
    expect(visitorsForConversions(1_000, 0.05)).toBe(20_000);
    expect(mdeFromConversions({ conversionsPerArm: 1_000 })).toBe(mde);
  });

  it("stays within ~3 % of the exact Fleiss n, and that gap is the documented price of the approximation", () => {
    const exact = sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.125 });
    const exactConversions = exact.perVariant * 0.03;
    const approximate = conversionsForMde({ mde: 0.125 });
    expect(exactConversions).toBeCloseTo(1_033, 0);
    // The approximation is the optimistic one – fewer conversions for the same claim.
    expect(approximate).toBeLessThan(exactConversions);
    expect(Math.abs(approximate / exactConversions - 1)).toBeLessThan(0.03);
  });

  it("rejects nonsense inputs instead of returning a number", () => {
    expect(() => conversionsForMde({ mde: 0 })).toThrow(/mde/);
    expect(() => mdeFromConversions({ conversionsPerArm: 0 })).toThrow(/conversionsPerArm/);
    expect(() => visitorsForConversions(1_000, 0)).toThrow(/baselineCR/);
    expect(() => conversionsForMde({ mde: 0.1, power: 1 })).toThrow(/power/);
  });
});
