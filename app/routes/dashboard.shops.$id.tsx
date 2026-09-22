import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireUser } from "../services/auth.server";
import { getShop } from "../services/shops.server";
import { listRecentOrders } from "../services/orders.server";
import { listRecentWebhookEvents } from "../services/webhooks.server";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";

// Shop detail – CLIENT users land here (guard in auth.server.ts). WP2: read-only Orders / Webhook events tables for
// inspecting ingestion. Experiments and results follow in WP5.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireUser(request);
  const shop = await getShop(params.id!);
  if (!shop) throw new Response("Shop not found", { status: 404 });
  const [orders, events] = await Promise.all([listRecentOrders(shop.id), listRecentWebhookEvents(shop.id)]);
  return {
    shop: { id: shop.id, domain: shop.domain, name: shop.name, status: shop.status },
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt.toISOString(),
      currency: o.currency,
      totalPrice: o.totalPrice.toString(),
      refunded: o.refunds.reduce((sum, r) => sum + Number(r.amount), 0),
      financialStatus: o.financialStatus,
      cancelled: o.cancelledAt !== null,
      sourceName: o.sourceName,
      isTest: o.isTest,
      attributions: o.attributions.map((a) => `${a.experiment.key}:${a.variant.key} (${a.source})`),
    })),
    events: events.map((e) => ({
      id: e.id,
      topic: e.topic,
      shopifyId: e.shopifyId,
      receivedAt: e.receivedAt.toISOString(),
      processedAt: e.processedAt?.toISOString() ?? null,
      attempts: e.attempts,
      error: e.error,
    })),
  };
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "medium" });
const money = (amount: string | number, currency: string) => new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(amount));

const Empty = () => <span className="text-base-content/30">—</span>;

export default function ShopDetail() {
  const { shop, orders, events } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader title={shop.name}>
        <StatusBadge status={shop.status} />
      </PageHeader>
      <p className="mb-5 text-sm text-base-content/60">{shop.domain}</p>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-base-content/60">Orders</h2>
      <div className="mb-6 overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Order</th>
              <th className="whitespace-nowrap">Created</th>
              <th className="text-right">Total</th>
              <th>Status</th>
              <th>Source</th>
              <th>Attribution</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-9 text-center text-base-content/60">
                  No orders yet.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="align-top">
                  <span className="font-medium">{o.orderNumber}</span>
                  {o.isTest && <span className="mt-0.5 block text-xs text-base-content/60">test order</span>}
                </td>
                <td className="whitespace-nowrap align-top tabular-nums">{dateFmt.format(new Date(o.createdAt))}</td>
                <td className="whitespace-nowrap text-right align-top tabular-nums">
                  {money(o.totalPrice, o.currency)}
                  {o.refunded > 0 && <span className="mt-0.5 block text-xs text-base-content/60">refunded {money(o.refunded, o.currency)}</span>}
                </td>
                <td className="align-top">
                  {o.financialStatus}
                  {o.cancelled && <span className="mt-0.5 block text-xs text-error">cancelled</span>}
                </td>
                <td className="align-top">{o.sourceName}</td>
                <td className="align-top">
                  {o.attributions.length === 0 ? <Empty /> : o.attributions.map((a) => <span key={a} className="block font-mono text-xs">{a}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-base-content/60">Webhook events</h2>
      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Topic</th>
              <th className="whitespace-nowrap">Received</th>
              <th className="whitespace-nowrap">Processed</th>
              <th className="text-right">Attempts</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="py-9 text-center text-base-content/60">
                  No webhook events yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id}>
                <td className="align-top">
                  <span className="font-mono text-xs">{e.topic}</span>
                  <span className="mt-0.5 block truncate text-xs text-base-content/60">{e.shopifyId}</span>
                </td>
                <td className="whitespace-nowrap align-top tabular-nums">{dateFmt.format(new Date(e.receivedAt))}</td>
                <td className="whitespace-nowrap align-top tabular-nums">{e.processedAt ? dateFmt.format(new Date(e.processedAt)) : <Empty />}</td>
                <td className="text-right align-top tabular-nums">{e.attempts}</td>
                <td className="max-w-md align-top">{e.error ? <span className="block truncate text-xs text-error">{e.error}</span> : <Empty />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-base-content/50">Last 50 of each, newest first.</p>
    </>
  );
}
