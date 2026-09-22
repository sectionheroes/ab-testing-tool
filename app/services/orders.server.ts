import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { shopAmount, shopAmountOrZero, shopCurrency, sumAmounts } from "./money";
import { slimOrder } from "./slim-order";
import { stripPii } from "./pii";
import { resolveAttributions } from "./attribution.server";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Every Order column that comes from the payload. Shared by orders/create and orders/updated (edits change totals). */
export function orderFields(payload: Json) {
  const createdAt = dateOrNull(payload.created_at);
  if (!createdAt) throw new Error("order.created_at missing");
  const shippingLines = Array.isArray(payload.shipping_lines) ? payload.shipping_lines.filter(isObject) : [];
  const customer = isObject(payload.customer) && payload.customer.id !== undefined && payload.customer.id !== null ? str(payload.customer.id) : null;
  return {
    shopifyOrderId: str(payload.id),
    orderNumber: str(payload.name || payload.order_number),
    createdAt,
    currency: shopCurrency(payload.total_price_set, "total_price_set"),
    totalPrice: shopAmount(payload.total_price_set, "total_price_set"),
    subtotalPrice: shopAmount(payload.subtotal_price_set, "subtotal_price_set"),
    totalShipping: shopAmountOrZero(payload.total_shipping_price_set, "total_shipping_price_set"),
    totalTax: shopAmountOrZero(payload.total_tax_set, "total_tax_set"),
    totalDiscounts: shopAmountOrZero(payload.total_discounts_set, "total_discounts_set"),
    shippingTitle: typeof shippingLines[0]?.title === "string" ? (shippingLines[0].title as string) : null,
    financialStatus: str(payload.financial_status) || "unknown",
    cancelledAt: dateOrNull(payload.cancelled_at),
    customerId: customer,
    sourceName: str(payload.source_name) || "unknown",
    isTest: payload.test === true,
    raw: slimOrder(stripPii(payload)) as Prisma.InputJsonObject,
  };
}

export function lineItemRows(payload: Json) {
  if (!Array.isArray(payload.line_items)) return [];
  return payload.line_items.filter(isObject).map((li) => ({
    shopifyLineId: str(li.id),
    shopifyVariantId: li.variant_id === null || li.variant_id === undefined ? null : str(li.variant_id),
    shopifyProductId: li.product_id === null || li.product_id === undefined ? null : str(li.product_id),
    quantity: Number(li.quantity) || 0,
    price: shopAmount(li.price_set, `line_items[${str(li.id)}].price_set`),
  }));
}

/**
 * orders/create: Order + line items, then attribution (contract 4.1). A redelivery under a new webhook id updates
 * the order but never re-attributes an order that already has attributions.
 */
export async function ingestOrderCreate(shopId: string, payload: Json): Promise<{ orderId: string; attributions: number }> {
  const fields = orderFields(payload);
  const items = lineItemRows(payload);

  const order = await prisma.$transaction(async (tx) => {
    const order = await tx.order.upsert({
      where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: fields.shopifyOrderId } },
      create: { shopId, ...fields },
      update: fields,
      select: { id: true },
    });
    await tx.orderLineItem.deleteMany({ where: { orderId: order.id } });
    if (items.length) await tx.orderLineItem.createMany({ data: items.map((i) => ({ orderId: order.id, ...i })) });
    return order;
  });

  const existing = await prisma.orderAttribution.count({ where: { orderId: order.id } });
  if (existing > 0) return { orderId: order.id, attributions: existing };

  const attributions = await resolveAttributions({
    shopId,
    shopifyOrderId: fields.shopifyOrderId,
    orderCreatedAt: fields.createdAt,
    customerId: fields.customerId,
    payload,
  });
  if (attributions.length) {
    await prisma.orderAttribution.createMany({
      data: attributions.map((a) => ({ orderId: order.id, ...a })),
      skipDuplicates: true,
    });
  }
  return { orderId: order.id, attributions: attributions.length };
}

/**
 * orders/updated: refresh status, cancellation and every money field (order edits change totals) plus line items.
 * Never re-runs attribution. Unknown order → no-op: Shopify delivers orders/updated before orders/create at times
 * (seen in WP1); the create carries the same totals.
 */
export async function ingestOrderUpdate(shopId: string, payload: Json): Promise<"updated" | "unknown_order"> {
  const fields = orderFields(payload);
  const existing = await prisma.order.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: fields.shopifyOrderId } },
    select: { id: true },
  });
  if (!existing) {
    console.log(`[orders/updated] order ${fields.shopifyOrderId} not ingested yet – skipped (orders/create follows)`);
    return "unknown_order";
  }
  const update = {
    currency: fields.currency,
    totalPrice: fields.totalPrice,
    subtotalPrice: fields.subtotalPrice,
    totalShipping: fields.totalShipping,
    totalTax: fields.totalTax,
    totalDiscounts: fields.totalDiscounts,
    shippingTitle: fields.shippingTitle,
    financialStatus: fields.financialStatus,
    cancelledAt: fields.cancelledAt,
    raw: fields.raw,
  };
  const items = lineItemRows(payload);
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: existing.id }, data: update });
    await tx.orderLineItem.deleteMany({ where: { orderId: existing.id } });
    if (items.length) await tx.orderLineItem.createMany({ data: items.map((i) => ({ orderId: existing.id, ...i })) });
  });
  return "updated";
}

/**
 * Refund amount in shop currency. Preferred: transactions[].amount_set.shop_money (kind=refund, status=success).
 * The REST webhook payload documents transactions with `amount` + `currency` only (presentment) – when amount_set is
 * absent we ask Admin GraphQL `refund.totalRefundedSet.shopMoney` (validated with the Dev MCP). Sum-of-parts is the
 * last resort when the shop is uninstalled or the API call fails.
 */
export async function refundAmount(shopDomain: string, payload: Json): Promise<{ amount: string; method: "transactions" | "graphql" | "parts" }> {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions.filter(isObject) : [];
  const relevant = transactions.filter((t) => (t.kind === undefined || t.kind === "refund") && (t.status === undefined || t.status === "success"));
  if (relevant.length && relevant.every((t) => isObject(t.amount_set) && isObject(t.amount_set.shop_money))) {
    return { amount: sumAmounts(relevant.map((t) => shopAmount(t.amount_set, "transactions[].amount_set"))), method: "transactions" };
  }
  try {
    const amount = await fetchTotalRefunded(shopDomain, str(payload.id));
    if (amount) return { amount, method: "graphql" };
  } catch (err) {
    console.warn(`[refunds/create] GraphQL refund lookup failed for ${str(payload.id)}: ${(err as Error).message}`);
  }
  return { amount: refundAmountFromParts(payload), method: "parts" };
}

async function fetchTotalRefunded(shopDomain: string, refundId: string): Promise<string | null> {
  const { admin } = await unauthenticated.admin(shopDomain);
  const response = await admin.graphql(
    `#graphql
      query ShabRefundTotal($id: ID!) { refund(id: $id) { id totalRefundedSet { shopMoney { amount currencyCode } } } }`,
    { variables: { id: `gid://shopify/Refund/${refundId}` } },
  );
  const { data } = (await response.json()) as { data?: { refund?: { totalRefundedSet?: { shopMoney?: { amount: string } } } | null } };
  const amount = data?.refund?.totalRefundedSet?.shopMoney?.amount;
  return typeof amount === "string" ? sumAmounts([amount]) : null;
}

const negate = (a: string) => (a.startsWith("-") ? a.slice(1) : a === "0.00" || /^0(\.0+)?$/.test(a) ? a : `-${a}`);

/** Last resort: refund_line_items (subtotal + tax) + refund_shipping_lines + order_adjustments, all shop_money. */
export function refundAmountFromParts(payload: Json): string {
  const parts: string[] = [];
  for (const li of (Array.isArray(payload.refund_line_items) ? payload.refund_line_items : []).filter(isObject)) {
    parts.push(shopAmountOrZero(li.subtotal_set, "refund_line_items[].subtotal_set"));
    parts.push(shopAmountOrZero(li.total_tax_set, "refund_line_items[].total_tax_set"));
  }
  for (const sl of (Array.isArray(payload.refund_shipping_lines) ? payload.refund_shipping_lines : []).filter(isObject)) {
    parts.push(shopAmountOrZero(sl.subtotal_amount_set, "refund_shipping_lines[].subtotal_amount_set"));
  }
  for (const adj of (Array.isArray(payload.order_adjustments) ? payload.order_adjustments : []).filter(isObject)) {
    // A "refund_discrepancy" adjustment is negative when more was refunded than the items sum to (custom amount
    // refund: items 0, adjustment -100 → refund 100), so adjustments are subtracted.
    parts.push(negate(shopAmountOrZero(adj.amount_set, "order_adjustments[].amount_set")));
    parts.push(negate(shopAmountOrZero(adj.tax_amount_set, "order_adjustments[].tax_amount_set")));
  }
  return sumAmounts(parts);
}

/** refunds/create: separate Refund row, Order untouched (net revenue is computed on aggregation). Unknown order → throw → retry. */
export async function ingestRefund(shopId: string, shopDomain: string, payload: Json): Promise<{ refundId: string; amount: string; method: string }> {
  const shopifyOrderId = str(payload.order_id);
  const order = await prisma.order.findUnique({ where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } }, select: { id: true } });
  if (!order) throw new Error(`refund ${str(payload.id)}: order ${shopifyOrderId} not ingested yet`);
  const createdAt = dateOrNull(payload.created_at) ?? dateOrNull(payload.processed_at) ?? new Date();
  const { amount, method } = await refundAmount(shopDomain, payload);
  const refund = await prisma.refund.upsert({
    where: { shopifyRefundId: str(payload.id) },
    create: { orderId: order.id, shopifyRefundId: str(payload.id), amount, createdAt },
    update: { amount, createdAt },
    select: { id: true },
  });
  return { refundId: refund.id, amount, method };
}

export function listRecentOrders(shopId: string, take = 50) {
  return prisma.order.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      currency: true,
      totalPrice: true,
      financialStatus: true,
      cancelledAt: true,
      sourceName: true,
      isTest: true,
      attributions: { select: { source: true, experiment: { select: { key: true } }, variant: { select: { key: true } } } },
      refunds: { select: { amount: true } },
    },
  });
}
