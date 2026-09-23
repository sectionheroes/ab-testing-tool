-- WP4: covering index for the live stats aggregation (ADR-0019, target < 500 ms at 1 M exposures).
-- Measured on local Postgres with 3 M exposure rows: parallel seq scan 136 ms -> index-only scan 43 ms.
CREATE INDEX IF NOT EXISTS "Exposure_experimentId_variantId_device_isBot_firstSeenAt_idx"
  ON "Exposure"("experimentId", "variantId", "device", "isBot", "firstSeenAt");
