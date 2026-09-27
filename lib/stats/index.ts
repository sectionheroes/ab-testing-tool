/**
 * lib/stats – the statistics engine. Pure TypeScript, no database, no imports from app/ (ESLint boundary, plan §2).
 *
 * STATS_VERSION is frozen into every ExperimentResult snapshot (ADR-0025). Bump it BY HAND whenever a formula in this
 * package changes, so an old report stays readable as "computed with 1.0.0" and is never silently recomputed.
 * Adding a field or fixing a comment is not a formula change; changing a test statistic, a CI method, the
 * winsorization rule, the Bonferroni rule or a sample-size formula is.
 */
export const STATS_VERSION = "1.0.0";

export {
  chiSquareCdf,
  chiSquareUpperP,
  incompleteBeta,
  logGamma,
  lowerGamma,
  normalCdf,
  normalQuantile,
  normalTwoSidedP,
  studentTCdf,
  studentTQuantile,
  studentTTwoSidedP,
  upperGamma,
} from "./distributions";
export { twoProportionZTest, type ProportionArm, type TwoProportionResult } from "./proportions";
export { srmCheck, SRM_ALARM_P, type SrmResult } from "./srm";
export { moments, percentile, welchTTest, welchTTestFromMoments, type Moments, type Samples, type WelchOptions, type WelchResult } from "./welch";
export { rpvMomentsFromOrders, sampleSize, type SampleSizeInput, type SampleSizeResult } from "./sample-size";
export {
  evaluate,
  guardrail,
  DEFAULT_ALPHA,
  GUARDRAIL_CR_RATIO,
  GUARDRAIL_MIN_VISITORS,
  WINSORIZE_Q,
  type DeviceResult,
  type EvaluateExperiment,
  type EvaluateResult,
  type GuardrailResult,
  type MetricResult,
  type VariantResult,
} from "./evaluate";
export { DEVICES, type ArmCounts, type Device, type Metric, type VariantStats } from "./types";
