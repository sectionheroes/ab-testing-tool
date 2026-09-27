/**
 * The stopping rule of ADR-0036 – three conditions instead of the single, visitor-based `plannedSampleSize` that
 * ADR-0018 was first implemented with. An experiment is evaluable when **every condition that is set** is met:
 *
 *   minConversionsPerArm   default 1000   converting visitors per arm (4.8)
 *   minDurationDays        default 14     calendar days since startedAt, in Shop.timezone
 *   requireFullWeeks       default true   only on multiples of 7 days counted FROM startedAt, never from Monday
 *
 * All three off (null / false) means never evaluable, exactly as a missing `plannedSampleSize` did. The coupling
 * `significant = stoppingRuleMet && pValue < alphaAdjusted` is unchanged, word for word (evaluate.ts).
 *
 * Nothing here stops an experiment. The rule says when a verdict may be *read*, and the futility flag is a hint, not
 * an action (ADR-0036, same posture as the guardrail).
 */
import { normalQuantile } from "./distributions";
import { addDays, daysBetween, localDayString } from "./timezone";

/** Futility (ADR-0036): a projected evaluation date more than six weeks after the start is a warning. */
export const FUTILITY_WEEKS = 6;
export const FUTILITY_DAYS = FUTILITY_WEEKS * 7;

export const DEFAULT_MIN_CONVERSIONS_PER_ARM = 1000;
export const DEFAULT_MIN_DURATION_DAYS = 14;
export const DEFAULT_REQUIRE_FULL_WEEKS = true;

export type StoppingRuleConfig = {
  /** Converting visitors per arm. null switches the condition off. */
  minConversionsPerArm: number | null;
  /** Calendar days since `startedAt` in the shop's timezone. null switches the condition off. */
  minDurationDays: number | null;
  /** Only on multiples of 7 days from `startedAt`. false switches the condition off. */
  requireFullWeeks: boolean;
};

export type StoppingRuleConditionKey = "minConversionsPerArm" | "minDurationDays" | "requireFullWeeks";

export type StoppingRuleCondition = {
  key: StoppingRuleConditionKey;
  /** false when the condition is switched off – an unset condition is not "met", it simply does not gate. */
  enabled: boolean;
  met: boolean;
  /** Where the experiment stands: converting visitors in the slowest arm, or elapsed calendar days. */
  current: number;
  /** What it has to reach. null for `requireFullWeeks`, which has no number. */
  target: number | null;
  /**
   * The day (YYYY-MM-DD, shop timezone) on which this condition is expected to be met. Known for the two day-based
   * conditions, projected from the conversion pace so far for the conversions one, null when there is no pace to
   * project from yet.
   */
  endsOn: string | null;
};

export type StoppingRule = StoppingRuleConfig & {
  /** True when at least one condition gates. All three off → `met` stays false forever. */
  configured: boolean;
  conditions: StoppingRuleCondition[];
  met: boolean;
  /** The latest of the three end dates – the day the experiment becomes evaluable. null when it cannot be projected. */
  evaluableOn: string | null;
  /** `evaluableOn` is more than six weeks after `startedAt`: the MDE is too small for this traffic (ADR-0036). */
  futility: boolean;
  /** Days since `startedAt` in the shop's timezone, 0 on the start day itself. null when the experiment never started. */
  elapsedDays: number | null;
  /** Converting visitors in the arm that has the fewest – the number `minConversionsPerArm` is compared against. */
  converterFloor: number;
};

export type StoppingRuleInput = StoppingRuleConfig & {
  startedAt: Date | string | null;
  now: Date;
  /** `Shop.timezone`; days and week boundaries are counted there, not in UTC (4.8). */
  timezone: string;
  /** Converting visitors per arm, in any order – only the minimum matters. */
  convertersPerArm: number[];
};

const asDate = (v: Date | string | null): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The first multiple of 7 days from the start that is at or after `day` – and at least one full week. */
function nextWeekBoundary(startDay: string, day: string): string {
  const offset = Math.max(daysBetween(startDay, day), 0);
  const weeks = Math.max(Math.ceil(offset / 7), 1);
  return addDays(startDay, weeks * 7);
}

const laterOf = (a: string | null, b: string | null): string | null => {
  if (a == null || b == null) return null; // one unknown end date makes the overall date unknown
  return daysBetween(a, b) > 0 ? b : a;
};

/**
 * Evaluates the rule. Pure: the caller supplies `now`, the shop timezone and the per-arm converter counts.
 *
 * The conversions end date is a projection from the pace so far – `converterFloor / elapsedDays` converting visitors
 * per day in the slowest arm, extrapolated to the target. On the start day, or with no conversion yet, there is no
 * pace and the date stays null; that also switches the futility check off rather than guessing.
 */
export function evaluateStoppingRule(input: StoppingRuleInput): StoppingRule {
  const startedAt = asDate(input.startedAt);
  const startDay = startedAt ? localDayString(startedAt, input.timezone) : null;
  const today = localDayString(input.now, input.timezone);
  const elapsedDays = startDay ? Math.max(daysBetween(startDay, today), 0) : null;
  const converterFloor = input.convertersPerArm.length > 0 ? Math.min(...input.convertersPerArm) : 0;

  const conversions: StoppingRuleCondition = {
    key: "minConversionsPerArm",
    enabled: input.minConversionsPerArm != null && input.minConversionsPerArm > 0,
    met: false,
    current: converterFloor,
    target: input.minConversionsPerArm,
    endsOn: null,
  };
  if (conversions.enabled) {
    const target = input.minConversionsPerArm as number;
    conversions.met = converterFloor >= target;
    if (conversions.met) {
      conversions.endsOn = today;
    } else if (startDay != null && elapsedDays != null && elapsedDays > 0 && converterFloor > 0) {
      const perDay = converterFloor / elapsedDays;
      conversions.endsOn = addDays(startDay, Math.ceil(target / perDay));
    }
  }

  const duration: StoppingRuleCondition = {
    key: "minDurationDays",
    enabled: input.minDurationDays != null && input.minDurationDays > 0,
    met: false,
    current: elapsedDays ?? 0,
    target: input.minDurationDays,
    endsOn: null,
  };
  if (duration.enabled) {
    const target = input.minDurationDays as number;
    duration.met = elapsedDays != null && elapsedDays >= target;
    if (startDay != null) duration.endsOn = addDays(startDay, target);
  }

  const fullWeeks: StoppingRuleCondition = {
    key: "requireFullWeeks",
    enabled: input.requireFullWeeks === true,
    met: false,
    current: elapsedDays ?? 0,
    target: null,
    endsOn: null,
  };
  if (fullWeeks.enabled) {
    fullWeeks.met = elapsedDays != null && elapsedDays >= 7 && elapsedDays % 7 === 0;
    if (startDay != null) {
      // The week boundary is only reachable once the other conditions are: it is the first multiple of 7 days from the
      // start at or after them. That is also what makes `evaluableOn` the latest of the three dates rather than a date
      // in the past.
      const gatedBy = laterOf(conversions.enabled ? conversions.endsOn : today, duration.enabled ? duration.endsOn : today);
      fullWeeks.endsOn = gatedBy == null ? null : fullWeeks.met && gatedBy === today ? today : nextWeekBoundary(startDay, gatedBy);
    }
  }

  const conditions = [conversions, duration, fullWeeks];
  const enabled = conditions.filter((c) => c.enabled);
  const configured = enabled.length > 0;
  const met = configured && enabled.every((c) => c.met);

  let evaluableOn: string | null = null;
  if (met) {
    evaluableOn = today;
  } else if (configured) {
    evaluableOn = enabled.reduce<string | null>((acc, c, i) => (i === 0 ? c.endsOn : laterOf(acc, c.endsOn)), null);
  }

  const futility = !met && startDay != null && evaluableOn != null && daysBetween(startDay, evaluableOn) > FUTILITY_DAYS;

  return {
    minConversionsPerArm: input.minConversionsPerArm,
    minDurationDays: input.minDurationDays,
    requireFullWeeks: input.requireFullWeeks,
    configured,
    conditions,
    met,
    evaluableOn,
    futility,
    elapsedDays,
    converterFloor,
  };
}

/**
 * Conversions per arm needed for a relative MDE on a conversion rate (ADR-0036):
 *
 *   MDE ≈ (z_{1−α/2} + z_power)·√(2/C)   ⇔   C = 2·(z_{1−α/2} + z_power)² / MDE²
 *
 * The point of this form is that it is **shop-independent**: the relative standard error of a conversion count is
 * ≈ √(1/C), so 1 000 conversions per arm buy ~12.5 % relative MDE whether the shop converts at 1 % or at 5 %. A
 * visitor number cannot say that without a baseline CR, and we do not have one – we only ever see the visitors of a
 * running experiment, not the shop's whole traffic.
 *
 * It is an approximation of the exact Fleiss n that `sampleSize()` returns (~3 % apart at CR 3 %, pinned by a test);
 * the two are exact inverses of each other, so the round trip MDE → conversions → MDE is lossless.
 */
export function conversionsForMde(opts: { mde: number; alpha?: number; power?: number }): number {
  const { z, mde } = plannerInputs(opts);
  return Math.ceil((2 * z * z) / (mde * mde));
}

/** The inverse: the relative MDE that `conversionsPerArm` converting visitors per arm can detect. */
export function mdeFromConversions(opts: { conversionsPerArm: number; alpha?: number; power?: number }): number {
  const { z } = plannerInputs({ mde: 1, ...opts });
  if (!(opts.conversionsPerArm > 0)) throw new Error(`mdeFromConversions: conversionsPerArm must be > 0, got ${opts.conversionsPerArm}`);
  return z * Math.sqrt(2 / opts.conversionsPerArm);
}

/** Visitors per arm implied by a conversion target at a baseline CR. Straight division – the CR is the only bridge. */
export function visitorsForConversions(conversionsPerArm: number, baselineCR: number): number {
  if (!(baselineCR > 0 && baselineCR < 1)) throw new Error(`visitorsForConversions: baselineCR must be in (0, 1), got ${baselineCR}`);
  return Math.ceil(conversionsPerArm / baselineCR);
}

function plannerInputs(opts: { mde: number; alpha?: number; power?: number }): { z: number; mde: number } {
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.8;
  if (!(alpha > 0 && alpha < 1)) throw new Error(`stopping-rule planner: alpha must be in (0, 1), got ${alpha}`);
  if (!(power > 0 && power < 1)) throw new Error(`stopping-rule planner: power must be in (0, 1), got ${power}`);
  if (!(opts.mde > 0)) throw new Error(`stopping-rule planner: mde must be > 0, got ${opts.mde}`);
  return { z: normalQuantile(1 - alpha / 2) + normalQuantile(power), mde: opts.mde };
}
