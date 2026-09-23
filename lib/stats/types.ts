// Shared shapes between lib/stats and its callers (app/services/stats.server.ts).
import type { Moments, Samples } from "./welch";

export type Metric = "CR" | "RPV" | "AOV";
export type Device = "mobile" | "desktop" | "tablet";
export const DEVICES: Device[] = ["mobile", "desktop", "tablet"];

/** The raw counts of one arm (whole experiment or one device slice), exactly as contract 4.8 defines them. */
export type ArmCounts = {
  /** Exposures with isBot = false, tainted days already removed. */
  visitors: number;
  /** Converting visitors – a visitor with three orders converts once (4.8). */
  converters: number;
  /** Counting orders (4.8: not pos / shopify_draft_order, test = false, not cancelled). */
  orders: number;
  /** Net revenue: attributed orders minus their refunds, shop currency. */
  revenue: number;
  /**
   * Net revenue per visitor. Either the raw per-visitor values (evaluate winsorizes across both arms) or the moments
   * of the already-winsorized values – stats.server.ts computes those in SQL so a million rows stay in Postgres.
   */
  rpvSamples?: Samples;
  rpvMoments?: Moments;
  /** Net revenue per order, same two ways. Only needed when AOV is the primary metric. */
  aovSamples?: Samples;
  aovMoments?: Moments;
};

export type VariantStats = ArmCounts & {
  key: string;
  name?: string;
  isControl: boolean;
  /** Configured weight, the expectation the SRM check tests against. */
  weight: number;
  /** Bot exposures, for botShare in the snapshot. Not part of any count. */
  botVisitors?: number;
  byDevice?: Partial<Record<Device, ArmCounts>>;
};
