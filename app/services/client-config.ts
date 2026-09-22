// Pure. Builds the `client` metafield JSON from contract 4.2 (docs/plan.md). Only RUNNING experiments go in –
// PAUSED/ENDED/DRAFT are omitted, that is the kill switch. Output is sorted by key so repeated builds are byte-identical.

/** json metafield limit for apps on API >= 2026-04 (Dev MCP: docs/apps/build/metafields/metafield-limits). */
export const JSON_METAFIELD_LIMIT_BYTES = 128 * 1024;
export const CONFIG_SIZE_GUARD = 0.8;
export const CONFIG_MAX_BYTES = Math.floor(JSON_METAFIELD_LIMIT_BYTES * CONFIG_SIZE_GUARD);

export type ExperimentStatusLike = "DRAFT" | "RUNNING" | "PAUSED" | "ENDED";

export type ConfigVariantInput = { key: string; weight: number; js: string | null; css: string | null };
export type ConfigExperimentInput = {
  key: string;
  status: ExperimentStatusLike;
  allocation: number;
  salt: string;
  targeting: unknown;
  trigger: unknown;
  hideUntilApplied: boolean;
  variants: ConfigVariantInput[];
};

export type ClientVariant = { key: string; weight: number; js: string | null; css: string | null };
export type ClientExperiment = {
  key: string;
  status: "running";
  allocation: number;
  salt: string;
  targeting: Record<string, unknown>;
  trigger: Record<string, unknown>;
  hideUntilApplied: boolean;
  variants: ClientVariant[];
};
export type ClientConfig = { v: 1; requireConsent: boolean; experiments: ClientExperiment[] };

const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const codeOrNull = (v: string | null | undefined) => (typeof v === "string" && v.trim() !== "" ? v : null);
const objectOr = (v: unknown, fallback: Record<string, unknown>): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fallback;

export function buildClientConfig(input: { requireConsent: boolean; experiments: ConfigExperimentInput[] }): ClientConfig {
  const experiments = input.experiments
    .filter((e) => e.status === "RUNNING")
    .map<ClientExperiment>((e) => ({
      key: e.key,
      status: "running",
      allocation: e.allocation,
      salt: e.salt,
      targeting: objectOr(e.targeting, {}),
      trigger: objectOr(e.trigger, { type: "immediate" }),
      hideUntilApplied: e.hideUntilApplied,
      variants: [...e.variants].sort(byKey).map((v) => ({ key: v.key, weight: v.weight, js: codeOrNull(v.js), css: codeOrNull(v.css) })),
    }))
    .sort(byKey);
  return { v: 1, requireConsent: input.requireConsent, experiments };
}

export class ConfigTooLargeError extends Error {
  constructor(
    public readonly bytes: number,
    public readonly maxBytes: number = CONFIG_MAX_BYTES,
  ) {
    super(
      `Client config is ${bytes} bytes, above the ${maxBytes} byte guard (${CONFIG_SIZE_GUARD * 100}% of the ${JSON_METAFIELD_LIMIT_BYTES} byte json metafield limit). Pause an experiment or shrink variant code.`,
    );
  }
}

/** Compact JSON (what gets written) plus its UTF-8 size; throws above the guard. */
export function serializeClientConfig(config: ClientConfig): { json: string; bytes: number } {
  const json = JSON.stringify(config);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > CONFIG_MAX_BYTES) throw new ConfigTooLargeError(bytes);
  return { json, bytes };
}
