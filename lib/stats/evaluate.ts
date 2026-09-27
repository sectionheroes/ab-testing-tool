/**
 * evaluate() – the one place where the counting definitions of contract 4.8 turn into numbers, and the only place
 * that is allowed to call an experiment significant. Its output is also the `numbers` part of the frozen
 * ExperimentResult snapshot (ADR-0025), which is why it carries the window, the tainted days, the bot share and the
 * per-device split: those are free at freeze time and unrecoverable afterwards.
 *
 * The hard rule (plan WP4, CLAUDE.md): `significant` is true only when `sampleSizeReached && pValue < alpha`.
 * Never otherwise, in no branch, for no metric.
 */
import { twoProportionZTest } from "./proportions";
import { srmCheck, type SrmResult } from "./srm";
import { DEVICES, type ArmCounts, type Device, type Metric, type VariantStats } from "./types";
import { welchTTest, welchTTestFromMoments, type WelchResult } from "./welch";

export const DEFAULT_ALPHA = 0.05;
/** Winsorization quantile for RPV and AOV – contract 4.8. */
export const WINSORIZE_Q = 0.99;
/** Guardrail: below this many visitors per arm the CR comparison is noise, so no warning is raised. */
export const GUARDRAIL_MIN_VISITORS = 500;
/** Guardrail: a variant converting below this share of the control's CR looks like breakage. */
export const GUARDRAIL_CR_RATIO = 0.5;

export type MetricResult = {
  /** cr, rpv or aov of this variant. */
  estimate: number;
  /** Relative lift against control; null on the control arm. */
  lift: number | null;
  /** Confidence interval of the relative lift; null on the control arm. */
  ci: [number, number] | null;
  /** Absolute difference against control and its interval, in the unit of the metric. */
  diff: number | null;
  diffCi: [number, number] | null;
  /** Only the primary metric gets a p-value (4.8). Secondary metrics carry estimate + CI and null here. */
  pValue: number | null;
  test: "two-proportion-z" | "welch-t" | null;
};

export type VariantResult = {
  key: string;
  name?: string;
  isControl: boolean;
  weight: number;
  visitors: number;
  converters: number;
  orders: number;
  revenue: number;
  cr: number;
  rpv: number;
  aov: number;
  /** Mirror of the primary metric, for callers that only want the headline numbers. */
  lift: number | null;
  ci: [number, number] | null;
  pValue: number | null;
  /** sampleSizeReached && pValue < alphaAdjusted. Never true in any other case. */
  significant: boolean;
  metrics: Record<Metric, MetricResult>;
  byDevice: Record<Device, DeviceResult>;
  warnings: string[];
};

export type DeviceResult = {
  visitors: number;
  converters: number;
  orders: number;
  revenue: number;
  cr: number;
  rpv: number;
  aov: number;
  metrics: Record<Metric, MetricResult>;
};

export type GuardrailResult = {
  warning: "possible breakage";
  /** Keys of the variants whose CR fell below half the control's. */
  variantKeys: string[];
  details: { key: string; cr: number; controlCr: number; visitors: number }[];
};

export type EvaluateExperiment = {
  primaryMetric: Metric;
  /** Per variant, from the sample-size calculator. null means: no plan, so never significant. */
  plannedSampleSize: number | null;
  alpha?: number;
  /** Evaluation window actually used, for the snapshot. */
  window?: { from: Date | string | null; to: Date | string | null };
  /** Days excluded per ADR-0026, as YYYY-MM-DD in the shop's timezone. */
  taintedDays?: string[];
};

export type EvaluateResult = {
  statsVersion: string;
  primaryMetric: Metric;
  alpha: number;
  /** alpha / comparisons when there is more than one variant against control (Bonferroni, 4.8). */
  alphaAdjusted: number;
  comparisons: number;
  plannedSampleSize: number | null;
  sampleSizeReached: boolean;
  /** True when at least one variant is significant on the primary metric. */
  significant: boolean;
  /**
   * Key of the significant variant with the best primary metric that also beat control, else null. Never set before
   * sampleSizeReached, and never set for a variant that lost significantly.
   */
  winner: string | null;
  srm: SrmResult;
  guardrail: GuardrailResult | null;
  variants: VariantResult[];
  window: { from: string | null; to: string | null };
  taintedDays: string[];
  /** Bot exposures / all exposures, 0 when the caller did not supply bot counts. */
  botShare: number;
  warnings: string[];
};

const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);
const iso = (v: Date | string | null | undefined) => (v == null ? null : v instanceof Date ? v.toISOString() : v);

const nullMetric = (estimate: number): MetricResult => ({ estimate, lift: null, ci: null, diff: null, diffCi: null, pValue: null, test: null });

/** Winsorized moments for one arm: prefer explicit moments (SQL did the work), else winsorize the samples here. */
function armMoments(a: ArmCounts, b: ArmCounts, which: "rpv" | "aov", alpha: number): WelchResult | null {
  const mA = which === "rpv" ? a.rpvMoments : a.aovMoments;
  const mB = which === "rpv" ? b.rpvMoments : b.aovMoments;
  if (mA && mB) return welchTTestFromMoments(mA, mB, { alpha });
  const sA = which === "rpv" ? a.rpvSamples : a.aovSamples;
  const sB = which === "rpv" ? b.rpvSamples : b.aovSamples;
  if (sA && sB) return welchTTest(sA, sB, { winsorize: WINSORIZE_Q, alpha });
  return null;
}

function metricResults(control: ArmCounts, arm: ArmCounts, isControl: boolean, primary: Metric, alpha: number): Record<Metric, MetricResult> {
  const cr = ratio(arm.converters, arm.visitors);
  const rpv = ratio(arm.revenue, arm.visitors);
  const aov = ratio(arm.revenue, arm.orders);
  const out: Record<Metric, MetricResult> = { CR: nullMetric(cr), RPV: nullMetric(rpv), AOV: nullMetric(aov) };
  if (isControl) return out;

  const z = twoProportionZTest(
    { n: control.visitors, conversions: control.converters },
    { n: arm.visitors, conversions: arm.converters },
    { alpha },
  );
  out.CR = {
    estimate: cr,
    lift: z.lift,
    ci: z.ci,
    diff: z.diff,
    diffCi: z.diffCi,
    pValue: primary === "CR" ? z.pValue : null,
    test: "two-proportion-z",
  };

  for (const which of ["rpv", "aov"] as const) {
    const key: Metric = which === "rpv" ? "RPV" : "AOV";
    const estimate = which === "rpv" ? rpv : aov;
    const w = armMoments(control, arm, which, alpha);
    if (!w) {
      // No per-visitor / per-order distribution supplied: report the point estimate and the naive lift, no interval.
      const base = which === "rpv" ? ratio(control.revenue, control.visitors) : ratio(control.revenue, control.orders);
      out[key] = { estimate, lift: base > 0 ? estimate / base - 1 : null, ci: null, diff: estimate - base, diffCi: null, pValue: null, test: null };
      continue;
    }
    out[key] = {
      estimate,
      lift: w.lift,
      ci: w.liftCi,
      diff: w.meanDiff,
      diffCi: w.ci,
      pValue: primary === key ? w.pValue : null,
      test: "welch-t",
    };
  }
  return out;
}

const emptyArm = (): ArmCounts => ({ visitors: 0, converters: 0, orders: 0, revenue: 0 });

/**
 * Guardrail (plan WP4): from 500 visitors per arm, a variant whose CR is below half the control's is flagged as
 * possible breakage. A hint only – nothing is stopped automatically.
 */
export function guardrail(variantStats: VariantStats[]): GuardrailResult | null {
  const control = variantStats.find((v) => v.isControl);
  if (!control || control.visitors < GUARDRAIL_MIN_VISITORS) return null;
  const controlCr = ratio(control.converters, control.visitors);
  if (controlCr <= 0) return null;
  const details = variantStats
    .filter((v) => !v.isControl && v.visitors >= GUARDRAIL_MIN_VISITORS)
    .map((v) => ({ key: v.key, cr: ratio(v.converters, v.visitors), controlCr, visitors: v.visitors }))
    .filter((d) => d.cr < GUARDRAIL_CR_RATIO * controlCr);
  if (details.length === 0) return null;
  return { warning: "possible breakage", variantKeys: details.map((d) => d.key), details };
}

/**
 * Normalises one arm: converting visitors can never exceed visitors (an order deduplicated to a customer that never
 * produced an exposure row, ADR-0032), so it is clamped and the clamp is reported. Same for a per-visitor revenue
 * sample that is longer than the visitor count.
 */
function normalise(arm: ArmCounts, label: string, warnings: string[]): ArmCounts {
  const out = { ...arm };
  if (out.converters > out.visitors) {
    warnings.push(`${label}: ${out.converters} converting visitors on ${out.visitors} visitors – clamped to ${out.visitors} (ADR-0032)`);
    out.converters = out.visitors;
  }
  if (out.rpvSamples && out.rpvSamples.length !== out.visitors) {
    warnings.push(`${label}: ${out.rpvSamples.length} revenue-per-visitor values for ${out.visitors} visitors`);
  }
  if (out.rpvMoments && out.rpvMoments.n !== out.visitors) {
    warnings.push(`${label}: revenue-per-visitor moments count ${out.rpvMoments.n} != ${out.visitors} visitors`);
  }
  return out;
}

export function evaluate(experiment: EvaluateExperiment, variantStats: VariantStats[], statsVersion: string): EvaluateResult {
  const warnings: string[] = [];
  const alpha = experiment.alpha ?? DEFAULT_ALPHA;
  const arms = variantStats.map((v) => ({ ...v, ...normalise(v, `variant ${v.key}`, warnings) }));
  const control = arms.find((v) => v.isControl);
  if (!control) throw new Error("evaluate: no control variant (contract 4.4: variant 'a' is always control)");

  const comparisons = Math.max(arms.length - 1, 1);
  // Bonferroni on alpha with more than two variants (4.8). Two variants = one comparison = no adjustment.
  const alphaAdjusted = comparisons > 1 ? alpha / comparisons : alpha;

  const planned = experiment.plannedSampleSize;
  const sampleSizeReached = planned != null && planned > 0 && arms.every((v) => v.visitors >= planned);
  if (planned == null) warnings.push("no plannedSampleSize – significance stays false until one is set (ADR-0018)");

  const srm = srmCheck(
    arms.map((v) => v.visitors),
    arms.map((v) => v.weight),
  );

  const variants: VariantResult[] = arms.map((arm) => {
    const armWarnings: string[] = [];
    const metrics = metricResults(control, arm, arm.isControl, experiment.primaryMetric, alphaAdjusted);
    const primary = metrics[experiment.primaryMetric];
    const pValue = primary.pValue;
    // The one rule: significance needs the planned sample size AND a p-value below the adjusted alpha.
    const significant = sampleSizeReached && pValue != null && Number.isFinite(pValue) && pValue < alphaAdjusted;

    const byDevice = Object.fromEntries(
      DEVICES.map((d) => {
        const armDevice = normalise(arm.byDevice?.[d] ?? emptyArm(), `variant ${arm.key} / ${d}`, armWarnings);
        const controlDevice = normalise(control.byDevice?.[d] ?? emptyArm(), `control / ${d}`, []);
        const deviceMetrics = metricResults(controlDevice, armDevice, arm.isControl, experiment.primaryMetric, alphaAdjusted);
        return [
          d,
          {
            visitors: armDevice.visitors,
            converters: armDevice.converters,
            orders: armDevice.orders,
            revenue: armDevice.revenue,
            cr: deviceMetrics.CR.estimate,
            rpv: deviceMetrics.RPV.estimate,
            aov: deviceMetrics.AOV.estimate,
            metrics: deviceMetrics,
          } satisfies DeviceResult,
        ];
      }),
    ) as Record<Device, DeviceResult>;

    const deviceVisitors = DEVICES.reduce((s, d) => s + byDevice[d].visitors, 0);
    if (arm.byDevice && deviceVisitors !== arm.visitors) {
      armWarnings.push(`variant ${arm.key}: device split sums to ${deviceVisitors} visitors, total says ${arm.visitors}`);
    }

    return {
      key: arm.key,
      name: arm.name,
      isControl: arm.isControl,
      weight: arm.weight,
      visitors: arm.visitors,
      converters: arm.converters,
      orders: arm.orders,
      revenue: arm.revenue,
      cr: metrics.CR.estimate,
      rpv: metrics.RPV.estimate,
      aov: metrics.AOV.estimate,
      lift: primary.lift,
      ci: primary.ci,
      pValue,
      significant,
      metrics,
      byDevice,
      warnings: armWarnings,
    };
  });

  const significantVariants = variants.filter((v) => v.significant);
  // A significant result can also be significantly WORSE. `winner` is the best significant variant that actually beat
  // control; a significant loser leaves winner null and the human picks the decision (plan §3).
  const candidates = significantVariants.filter((v) => (v.lift ?? 0) > 0);
  const winner =
    candidates.length > 0
      ? candidates.reduce((best, v) =>
          v.metrics[experiment.primaryMetric].estimate > best.metrics[experiment.primaryMetric].estimate ? v : best,
        ).key
      : null;

  const totalVisitors = arms.reduce((s, v) => s + v.visitors, 0);
  const totalBots = arms.reduce((s, v) => s + (v.botVisitors ?? 0), 0);

  for (const v of variants) warnings.push(...v.warnings);
  if (srm.alarm) warnings.push(`SRM: traffic split does not match the configured weights (p = ${srm.pValue.toExponential(2)})`);

  return {
    statsVersion,
    primaryMetric: experiment.primaryMetric,
    alpha,
    alphaAdjusted,
    comparisons,
    plannedSampleSize: planned,
    sampleSizeReached,
    significant: significantVariants.length > 0,
    winner,
    srm,
    guardrail: guardrail(variantStats),
    variants,
    window: { from: iso(experiment.window?.from), to: iso(experiment.window?.to) },
    taintedDays: experiment.taintedDays ?? [],
    botShare: totalVisitors + totalBots > 0 ? totalBots / (totalVisitors + totalBots) : 0,
    warnings,
  };
}
