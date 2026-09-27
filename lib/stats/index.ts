/**
 * lib/stats – the statistics engine. Pure TypeScript, no database, no imports from app/ (ESLint boundary, plan §2).
 *
 * STATS_VERSION is frozen into every ExperimentResult snapshot (ADR-0025). Bump it BY HAND whenever a formula in this
 * package changes, so an old report stays readable as "computed with 1.0.0" and is never silently recomputed.
 * Adding a field or fixing a comment is not a formula change; changing a test statistic, a CI method, the
 * winsorization rule, the Bonferroni rule or a sample-size formula is.
 *
 * 2.0.0 (WP4.1): the conversion count changed (one conversion is one *visitor* now that `_ab_v` binds orders to
 * exposures, ADR-0033 – before it was one identity, ADR-0032) and the evaluability rule changed (the three-condition
 * stopping rule of ADR-0036 replaced `plannedSampleSize`). Both move numbers, so this is a major bump.
 */
export const STATS_VERSION = "2.0.0";

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
export {
  rpvMomentsFromOrders,
  rpvSurcharge,
  sampleSize,
  RPV_POWER_AT_PLANNED_N,
  type SampleSizeInput,
  type SampleSizeResult,
} from "./sample-size";
export {
  conversionsForMde,
  evaluateStoppingRule,
  mdeFromConversions,
  visitorsForConversions,
  DEFAULT_MIN_CONVERSIONS_PER_ARM,
  DEFAULT_MIN_DURATION_DAYS,
  DEFAULT_REQUIRE_FULL_WEEKS,
  FUTILITY_DAYS,
  FUTILITY_WEEKS,
  type StoppingRule,
  type StoppingRuleCondition,
  type StoppingRuleConditionKey,
  type StoppingRuleConfig,
} from "./stopping-rule";
export {
  classifyChannel,
  referrerHost,
  CHANNELS,
  CHANNEL_LISTS_VERSION,
  EMAIL_MEDIUMS,
  EMAIL_SOURCE_SUBSTRINGS,
  PAID_OTHER_MEDIUMS,
  PAID_SEARCH_MEDIUMS,
  PAID_SOCIAL_MEDIUMS,
  SEARCH_HOSTS,
  SEARCH_SOURCES,
  SHOPPING_HOSTS,
  SHOPPING_PATHS,
  SOCIAL_HOSTS,
  SOCIAL_SOURCES,
  type Channel,
  type ClassifyOptions,
  type Utm,
} from "./channel";
export { addDays, dayRange, daysBetween, localDayRangeUtc, localDayString, timezoneOffsetMs } from "./timezone";
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
export { DEVICES, DEVICE_BUCKETS, UNKNOWN_DEVICE, type ArmCounts, type Device, type DeviceBucket, type Metric, type VariantStats } from "./types";
