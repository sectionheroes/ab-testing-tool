import { describe, expect, it } from "vitest";
import {
  CONFIG_MAX_BYTES,
  ConfigTooLargeError,
  JSON_METAFIELD_LIMIT_BYTES,
  buildClientConfig,
  serializeClientConfig,
  type ConfigExperimentInput,
} from "./client-config";

const exp = (key: string, status: ConfigExperimentInput["status"], extra: Partial<ConfigExperimentInput> = {}): ConfigExperimentInput => ({
  key,
  status,
  allocation: 1,
  salt: "k3f9",
  targeting: { url: { match: "regex", value: "^/products/" }, device: ["mobile", "desktop", "tablet"] },
  trigger: { type: "immediate" },
  hideUntilApplied: false,
  variants: [
    { key: "b", weight: 0.5, js: "document.title='b'", css: ".x{}" },
    { key: "a", weight: 0.5, js: null, css: "" },
  ],
  ...extra,
});

describe("buildClientConfig", () => {
  it("empty shop → v1 with no experiments", () => {
    expect(buildClientConfig({ requireConsent: true, experiments: [] })).toEqual({ v: 1, requireConsent: true, experiments: [] });
  });

  it("includes RUNNING only – PAUSED, ENDED and DRAFT are the kill switch", () => {
    const cfg = buildClientConfig({
      requireConsent: false,
      experiments: [exp("running", "RUNNING"), exp("paused", "PAUSED"), exp("ended", "ENDED"), exp("draft", "DRAFT")],
    });
    expect(cfg.experiments.map((e) => e.key)).toEqual(["running"]);
    expect(cfg.experiments[0].status).toBe("running");
  });

  it("matches contract 4.2 field by field and normalises empty code to null", () => {
    const [e] = buildClientConfig({ requireConsent: false, experiments: [exp("pdp-reviews-above-price", "RUNNING")] }).experiments;
    expect(e).toEqual({
      key: "pdp-reviews-above-price",
      status: "running",
      allocation: 1,
      salt: "k3f9",
      targeting: { url: { match: "regex", value: "^/products/" }, device: ["mobile", "desktop", "tablet"] },
      trigger: { type: "immediate" },
      hideUntilApplied: false,
      variants: [
        { key: "a", weight: 0.5, js: null, css: null },
        { key: "b", weight: 0.5, js: "document.title='b'", css: ".x{}" },
      ],
    });
  });

  it("is deterministic: shuffled input gives byte-identical output", () => {
    const a = [exp("zeta", "RUNNING"), exp("alpha", "RUNNING"), exp("mid", "RUNNING")];
    const b = [a[2], a[0], a[1]];
    const ja = serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: a })).json;
    const jb = serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: b })).json;
    expect(ja).toBe(jb);
    expect(JSON.parse(ja).experiments.map((e: { key: string }) => e.key)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("falls back to {} targeting and immediate trigger when the DB holds junk", () => {
    const [e] = buildClientConfig({ requireConsent: false, experiments: [exp("x", "RUNNING", { targeting: null, trigger: [] })] }).experiments;
    expect(e.targeting).toEqual({});
    expect(e.trigger).toEqual({ type: "immediate" });
  });
});

describe("serializeClientConfig size guard", () => {
  it("guard is 80 % of the 128 KB json limit", () => {
    expect(JSON_METAFIELD_LIMIT_BYTES).toBe(131072);
    expect(CONFIG_MAX_BYTES).toBe(104857);
  });

  it("reports UTF-8 bytes, not string length", () => {
    const { bytes, json } = serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: [exp("ü", "RUNNING", { variants: [{ key: "a", weight: 1, js: "€", css: null }] })] }));
    expect(bytes).toBe(Buffer.byteLength(json, "utf8"));
    expect(bytes).toBeGreaterThan(json.length);
  });

  it("fires above the guard and passes just below it", () => {
    const big = (n: number) => exp("big", "RUNNING", { variants: [{ key: "a", weight: 1, js: "x".repeat(n), css: null }] });
    const base = serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: [big(1)] })).bytes;
    const fits = CONFIG_MAX_BYTES - base + 1;
    expect(serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: [big(fits)] })).bytes).toBe(CONFIG_MAX_BYTES);
    expect(() => serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: [big(fits + 1)] }))).toThrow(ConfigTooLargeError);
    try {
      serializeClientConfig(buildClientConfig({ requireConsent: false, experiments: [big(fits + 1)] }));
    } catch (err) {
      expect((err as ConfigTooLargeError).bytes).toBe(CONFIG_MAX_BYTES + 1);
      expect((err as Error).message).toMatch(/80%/);
    }
  });
});
