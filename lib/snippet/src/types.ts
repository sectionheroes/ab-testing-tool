// Mirror of contract 4.2 (docs/plan.md). lib/ never imports from app/ – keep this file in sync by hand.

export type UrlRule = { match: "exact" | "contains" | "regex"; value: string };
export type Device = "mobile" | "tablet" | "desktop";

export type Variant = { key: string; weight: number; js: string | null; css: string | null };

export type Experiment = {
  key: string;
  status: "running";
  allocation: number;
  salt: string;
  targeting: { url?: UrlRule; device?: Device[]; [k: string]: unknown };
  trigger: { type: "immediate" } | { type: "visible"; selector: string };
  hideUntilApplied: boolean;
  variants: Variant[];
};

export type Config = { v: 1; requireConsent: boolean; experiments: Experiment[] };

export type Shab = { config: Config | null; customerId: number | null; shop: string };

declare global {
  interface Window {
    __shab?: Shab;
    Shopify?: {
      loadFeatures?: (features: { name: string; version: string }[], cb: (err: unknown) => void) => void;
      customerPrivacy?: { analyticsProcessingAllowed: () => boolean };
      analytics?: { publish?: (name: string, payload: unknown) => void };
    };
    dataLayer?: unknown[];
  }
}
