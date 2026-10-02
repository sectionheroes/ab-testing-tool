/**
 * Everything the experiment form means, as plain data — no database, no React. The dashboard route, the service layer
 * and (from 5c) the CLI all validate through here, so a key that the UI accepts is a key the API accepts.
 *
 * Deliberately not a `.server.ts`: the form imports the same functions to show inline errors while typing. Nothing in
 * here touches Prisma, so that is safe.
 *
 * Contracts it has to honour:
 *  - **4.1** `experiment_key` and `variant_key` match `^[a-z0-9-]+$`; `:` and `,` are separators in the cart
 *    attribute, so a key containing one would silently corrupt the attribution of every order.
 *  - **4.2** targeting is `{ url: { match, value }, device: [...] }` and the trigger is
 *    `{ type: "immediate" } | { type: "visible", selector }`.
 *  - **4.4** weights are cumulated in array order and must add up to 1.0; allocation is a share of traffic.
 *  - **4.6** what may still be edited while RUNNING (see `LOCKED_WHILE_RUNNING`).
 *  - **ADR-0036** the stopping rule. The UI writes `minDurationDays = 7 × minFullWeeks` and `requireFullWeeks = true`;
 *    the model keeps both fields, the form just never offers the loose combinations.
 */
import { DEFAULT_MIN_CONVERSIONS_PER_ARM } from "../../lib/stats";

export const URL_MATCHES = ["contains", "exact", "regex"] as const;
export type UrlMatch = (typeof URL_MATCHES)[number];

export const URL_MATCH_LABELS: Record<UrlMatch, string> = {
  contains: "URL contains",
  exact: "URL is exactly",
  regex: "URL matches pattern",
};

export const DEVICES = ["mobile", "desktop", "tablet"] as const;
export type DeviceKey = (typeof DEVICES)[number];
export const DEVICE_LABELS: Record<DeviceKey, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };

export const METRICS = ["CR", "RPV", "AOV"] as const;
export type MetricKey = (typeof METRICS)[number];
export const METRIC_LABELS: Record<MetricKey, string> = {
  CR: "Conversion rate",
  RPV: "Revenue per visitor",
  AOV: "Average order value",
};

/** Contract 4.8: AOV compares buyers only, so the population moves when the variant moves the conversion rate. */
export const AOV_WARNING =
  "Only buyers are compared here. If the variant changes how many people buy, this number can point the wrong way.";

/** Contract 4.6: these are frozen once an experiment is RUNNING, because changing them reshuffles the buckets. */
export const LOCKED_WHILE_RUNNING = ["key", "targeting", "allocation", "weights", "salt"] as const;

export const MIN_FULL_WEEKS = 1;
export const MAX_FULL_WEEKS = 52;
export const VARIANT_KEYS = ["a", "b", "c", "d", "e", "f"] as const;
export const MAX_VARIANTS = VARIANT_KEYS.length;

export type VariantInput = {
  key: string;
  name: string;
  /** 0–100, as typed. Stored as a 0–1 weight. */
  weightPct: number;
  js: string;
  css: string;
};

export type ExperimentInput = {
  name: string;
  key: string;
  hypothesis: string;
  primaryMetric: MetricKey;
  urlMatch: UrlMatch;
  urlValue: string;
  devices: DeviceKey[];
  triggerType: "immediate" | "visible";
  triggerSelector: string;
  hideUntilApplied: boolean;
  /** 0–100, as typed. Stored as a 0–1 allocation. */
  allocationPct: number;
  variants: VariantInput[];
  minConversionsPerArm: number;
  minFullWeeks: number;
};

export type FieldErrors = Record<string, string>;

export function emptyExperimentInput(): ExperimentInput {
  return {
    name: "",
    key: "",
    hypothesis: "",
    primaryMetric: "CR",
    urlMatch: "contains",
    urlValue: "",
    devices: [...DEVICES],
    triggerType: "immediate",
    triggerSelector: "",
    hideUntilApplied: false,
    allocationPct: 100,
    variants: [
      { key: "a", name: "Control", weightPct: 50, js: "", css: "" },
      { key: "b", name: "", weightPct: 50, js: "", css: "" },
    ],
    minConversionsPerArm: DEFAULT_MIN_CONVERSIONS_PER_ARM,
    minFullWeeks: 2,
  };
}

/**
 * Name → key. Contract 4.1 allows `[a-z0-9-]` only, so everything else collapses to a single hyphen. German umlauts
 * are transliterated rather than dropped — "Größe" becoming "gre" would be a key nobody recognises.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const KEY_PATTERN = /^[a-z0-9-]+$/;

/** A CSS selector is valid if the browser (or jsdom in tests) can parse it. Nothing else can answer this reliably. */
export function selectorCompiles(selector: string): boolean {
  if (typeof document === "undefined") return selector.trim().length > 0; // server-side: shape check only
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function regexCompiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Percentages are entered as integers; 0.1 steps would be false precision on a hash bucket of 10.000 slots (4.4). */
const sumPct = (variants: VariantInput[]) => variants.reduce((s, v) => s + (Number.isFinite(v.weightPct) ? v.weightPct : 0), 0);

export function validateExperimentInput(
  input: ExperimentInput,
  opts: { takenKeys?: string[]; locked?: boolean } = {},
): FieldErrors {
  const errors: FieldErrors = {};
  const taken = (opts.takenKeys ?? []).map((k) => k.toLowerCase());

  if (!input.name.trim()) errors.name = "Give the test a name.";

  const key = input.key.trim();
  if (!key) errors.key = "A key is required.";
  else if (!KEY_PATTERN.test(key)) errors.key = "Use lowercase letters, numbers and hyphens only.";
  else if (taken.includes(key.toLowerCase())) errors.key = `This key is already used in this shop: ${key}`;

  if (!input.urlValue.trim()) errors.urlValue = "Say which pages the test runs on.";
  else if (input.urlMatch === "regex" && !regexCompiles(input.urlValue)) errors.urlValue = "This pattern is not valid.";

  if (input.devices.length === 0) errors.devices = "Pick at least one device.";

  if (input.triggerType === "visible") {
    if (!input.triggerSelector.trim()) errors.triggerSelector = "Name the element that has to come into view.";
    else if (!selectorCompiles(input.triggerSelector)) errors.triggerSelector = "This selector is not valid.";
  }

  if (!(input.allocationPct > 0 && input.allocationPct <= 100)) {
    errors.allocationPct = "Visitors in test has to be between 1 and 100 %.";
  }

  if (input.variants.length < 2) errors.variants = "A test needs the control and at least one variant.";
  if (input.variants.length > MAX_VARIANTS) errors.variants = `At most ${MAX_VARIANTS} variants.`;
  input.variants.forEach((v, i) => {
    if (!v.name.trim()) errors[`variant.${i}.name`] = "Name this variant.";
    if (!KEY_PATTERN.test(v.key)) errors[`variant.${i}.key`] = "Variant keys are lowercase letters, numbers and hyphens.";
  });

  const total = sumPct(input.variants);
  // 0.01 of a percentage point: the fields are integers, this only absorbs float addition.
  if (Math.abs(total - 100) > 0.01) {
    errors.weights = `Splits add up to ${formatPct(total)} %. They need to add up to 100 %.`;
  }

  if (!(input.minConversionsPerArm >= 1)) errors.minConversionsPerArm = "Enter at least 1 conversion per variant.";
  if (!(input.minFullWeeks >= MIN_FULL_WEEKS && input.minFullWeeks <= MAX_FULL_WEEKS)) {
    errors.minFullWeeks = `Between ${MIN_FULL_WEEKS} and ${MAX_FULL_WEEKS} weeks.`;
  }

  return errors;
}

const formatPct = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

/**
 * Contract 4.2 targeting object, exactly the two fields the snippet reads in phase 1.
 *
 * The device list is written in a fixed order. The snippet asks whether a device is *in* the list, so the order
 * carries no meaning – but writing it in click order would make two saves of the same selection differ, and
 * contract 4.6 decides whether a running experiment changed by comparing exactly this object.
 */
export function toTargeting(input: Pick<ExperimentInput, "urlMatch" | "urlValue" | "devices">) {
  const device = DEVICES.filter((d) => input.devices.includes(d));
  return { url: { match: input.urlMatch, value: input.urlValue.trim() }, device };
}

export function toTrigger(input: Pick<ExperimentInput, "triggerType" | "triggerSelector">) {
  return input.triggerType === "visible" ? { type: "visible", selector: input.triggerSelector.trim() } : { type: "immediate" };
}

/** The reverse, for the edit form. Unknown shapes fall back to the defaults rather than throwing on old rows. */
export function fromTargeting(value: unknown): Pick<ExperimentInput, "urlMatch" | "urlValue" | "devices"> {
  const t = (value ?? {}) as { url?: { match?: string; value?: string }; device?: unknown };
  const match = URL_MATCHES.includes(t.url?.match as UrlMatch) ? (t.url?.match as UrlMatch) : "contains";
  const picked = Array.isArray(t.device) ? t.device.filter((d): d is DeviceKey => DEVICES.includes(d as DeviceKey)) : [...DEVICES];
  const devices = DEVICES.filter((d) => picked.includes(d));
  return { urlMatch: match, urlValue: typeof t.url?.value === "string" ? t.url.value : "", devices: devices.length ? devices : [...DEVICES] };
}

export function fromTrigger(value: unknown): Pick<ExperimentInput, "triggerType" | "triggerSelector"> {
  const t = (value ?? {}) as { type?: string; selector?: string };
  return t.type === "visible"
    ? { triggerType: "visible", triggerSelector: typeof t.selector === "string" ? t.selector : "" }
    : { triggerType: "immediate", triggerSelector: "" };
}

/**
 * ADR-0036: the form offers whole weeks, the model stores days. `requireFullWeeks` is written as true because the
 * form has no way to express anything else — the field stays in the schema for the CLI and for older rows.
 */
export function toStoppingRule(input: Pick<ExperimentInput, "minConversionsPerArm" | "minFullWeeks">) {
  return {
    minConversionsPerArm: Math.round(input.minConversionsPerArm),
    minDurationDays: Math.round(input.minFullWeeks) * 7,
    requireFullWeeks: true,
  };
}

/** Days → whole weeks for the form. Rounds up, so a 10-day rule shows as 2 weeks and is never displayed as looser. */
export function fullWeeksFromDays(days: number | null): number {
  if (days == null || !(days > 0)) return MIN_FULL_WEEKS;
  return Math.max(MIN_FULL_WEEKS, Math.ceil(days / 7));
}

export const pctToFraction = (pct: number) => Math.round(pct * 100) / 10000;
export const fractionToPct = (fraction: number) => Math.round(fraction * 10000) / 100;

/**
 * The form's POST body → `ExperimentInput`. One parser for the dashboard action and (from 5c) the API, so the shape
 * the UI sends and the shape the service layer validates can never drift apart.
 *
 * Variants arrive as `variant.<i>.<field>` with `variantCount` saying how many to read. Anything missing or
 * unparseable falls back to the default rather than throwing — `validateExperimentInput` is what reports problems,
 * and it can say "splits add up to 90 %" where a parser could only say "bad request".
 */
export function parseExperimentForm(form: FormData): ExperimentInput {
  const str = (key: string, fallback = "") => {
    const v = form.get(key);
    return typeof v === "string" ? v : fallback;
  };
  const num = (key: string, fallback: number) => {
    const v = Number(str(key).replace(",", "."));
    return Number.isFinite(v) ? v : fallback;
  };
  const defaults = emptyExperimentInput();

  const count = Math.min(Math.max(Math.round(num("variantCount", 2)), 1), MAX_VARIANTS);
  const variants: VariantInput[] = [];
  for (let i = 0; i < count; i++) {
    variants.push({
      key: str(`variant.${i}.key`, VARIANT_KEYS[i] ?? `v${i}`),
      name: str(`variant.${i}.name`).trim(),
      weightPct: num(`variant.${i}.weight`, 0),
      js: str(`variant.${i}.js`),
      css: str(`variant.${i}.css`),
    });
  }

  const urlMatch = str("urlMatch") as UrlMatch;
  const primaryMetric = str("primaryMetric") as MetricKey;
  const triggerType = str("triggerType") === "visible" ? "visible" : "immediate";

  return {
    name: str("name").trim(),
    key: str("key").trim().toLowerCase(),
    hypothesis: str("hypothesis").trim(),
    primaryMetric: METRICS.includes(primaryMetric) ? primaryMetric : defaults.primaryMetric,
    urlMatch: URL_MATCHES.includes(urlMatch) ? urlMatch : defaults.urlMatch,
    urlValue: str("urlValue").trim(),
    devices: DEVICES.filter((d) => form.get(`device.${d}`) !== null),
    triggerType,
    triggerSelector: str("triggerSelector").trim(),
    hideUntilApplied: form.get("hideUntilApplied") !== null,
    allocationPct: num("allocationPct", defaults.allocationPct),
    variants,
    minConversionsPerArm: Math.round(num("minConversionsPerArm", defaults.minConversionsPerArm)),
    minFullWeeks: Math.round(num("minFullWeeks", defaults.minFullWeeks)),
  };
}
