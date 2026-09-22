import type { AttributionSource } from "@prisma/client";
import prisma from "../db.server";
import { extractAbValue, parseAbValue } from "./ab-value";

export type Attribution = { experimentId: string; variantId: string; source: AttributionSource };

/**
 * Contract 4.1, in this exact order: note_attributes[_ab] → first non-empty line_items[].properties[_ab] →
 * CUSTOMER_LOOKUP via Exposure.customerId. Unknown experiment/variant keys are ignored but logged.
 * The attribution window (4.8) is applied by stats.server – here we only record what the order carried.
 */
export async function resolveAttributions(input: {
  shopId: string;
  shopifyOrderId: string;
  orderCreatedAt: Date;
  customerId: string | null;
  payload: Record<string, unknown>;
}): Promise<Attribution[]> {
  const carried = extractAbValue(input.payload);
  if (carried) {
    const pairs = parseAbValue(carried.value);
    if (!pairs) {
      console.warn(`[attribution] order ${input.shopifyOrderId}: _ab value does not match contract 4.1: ${JSON.stringify(carried.value)}`);
      return [];
    }
    return resolveKeys(input.shopId, input.shopifyOrderId, pairs, carried.source);
  }
  if (!input.customerId) return [];
  return customerLookup(input.shopId, input.customerId, input.orderCreatedAt);
}

async function resolveKeys(
  shopId: string,
  shopifyOrderId: string,
  pairs: { experimentKey: string; variantKey: string }[],
  source: AttributionSource,
): Promise<Attribution[]> {
  const experiments = await prisma.experiment.findMany({
    where: { shopId, key: { in: pairs.map((p) => p.experimentKey) } },
    select: { id: true, key: true, variants: { select: { id: true, key: true } } },
  });
  const byKey = new Map(experiments.map((e) => [e.key, e]));
  const out: Attribution[] = [];
  for (const { experimentKey, variantKey } of pairs) {
    const exp = byKey.get(experimentKey);
    const variant = exp?.variants.find((v) => v.key === variantKey);
    if (!exp || !variant) {
      console.warn(`[attribution] order ${shopifyOrderId}: unknown ${exp ? "variant" : "experiment"} key ${experimentKey}:${variantKey} – ignored`);
      continue;
    }
    out.push({ experimentId: exp.id, variantId: variant.id, source });
  }
  return out;
}

/**
 * Experiments that were running at order time: startedAt <= createdAt AND (endedAt IS NULL OR endedAt >= createdAt).
 * Deliberately not `status = RUNNING`, so a retry after the experiment ended still attributes. One attribution per
 * experiment from the customer's exposure with firstSeenAt <= createdAt (latest wins if there are several).
 */
async function customerLookup(shopId: string, customerId: string, orderCreatedAt: Date): Promise<Attribution[]> {
  const exposures = await prisma.exposure.findMany({
    where: {
      shopId,
      customerId,
      firstSeenAt: { lte: orderCreatedAt },
      experiment: {
        startedAt: { lte: orderCreatedAt },
        OR: [{ endedAt: null }, { endedAt: { gte: orderCreatedAt } }],
      },
    },
    orderBy: { firstSeenAt: "desc" },
    select: { experimentId: true, variantId: true },
  });
  const seen = new Set<string>();
  const out: Attribution[] = [];
  for (const e of exposures) {
    if (seen.has(e.experimentId)) continue;
    seen.add(e.experimentId);
    out.push({ experimentId: e.experimentId, variantId: e.variantId, source: "CUSTOMER_LOOKUP" });
  }
  return out;
}
