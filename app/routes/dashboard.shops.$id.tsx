import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireUser } from "../services/auth.server";
import { getShop } from "../services/shops.server";
import { listRecentOrders } from "../services/orders.server";
import { listRecentWebhookEvents } from "../services/webhooks.server";
import { listExposureCounts, listRecentSnippetErrors } from "../services/exposures.server";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";

// Shop detail – CLIENT users land here (guard in auth.server.ts). Read-only inspection tables: Orders / Webhook events
// (WP2), Exposures per variant with bot share / Snippet errors (WP3). Experiments and results follow in WP5.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireUser(request);
  const shop = await getShop(params.id!);
  if (!shop) throw new Response("Shop not found", { status: 404 });
  const [orders, events, exposures, snippetErrors] = await Promise.all([
    listRecentOrders(shop.id),
    listRecentWebhookEvents(shop.id),
    listExposureCounts(shop.id),
    listRecentSnippetErrors(shop.id),
  ]);
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
    exposures,
    snippetErrors: snippetErrors.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      experimentKey: e.experimentKey,
      variantKey: e.variantKey,
      message: e.message,
      url: e.url,
      userAgent: e.userAgent,
    })),
  };
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "medium" });
const money = (amount: string | number, currency: string) => new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(amount));
const int = new Intl.NumberFormat("de-DE");
const pct = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

const Empty = () => <span className="text-base-content/30">—</span>;

export default function ShopDetail() {
  const { shop, orders, events, exposures, snippetErrors } = useLoaderData<typeof loader>();
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

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-base-content/60">Exposures</h2>
      <div className="mb-6 overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Experiment</th>
              <th>Variant</th>
              <th className="text-right">Visitors</th>
              <th className="text-right">Bots</th>
              <th className="whitespace-nowrap text-right">Bot share</th>
            </tr>
          </thead>
          <tbody>
            {exposures.length === 0 && (
              <tr>
                <td colSpan={5} className="py-9 text-center text-base-content/60">
                  No exposures yet.
                </td>
              </tr>
            )}
            {exposures.map((x) => (
              <tr key={`${x.experimentKey}:${x.variantKey}`}>
                <td className="align-top font-mono text-xs">{x.experimentKey}</td>
                <td className="align-top font-mono text-xs">{x.variantKey}</td>
                <td className="text-right align-top tabular-nums">{int.format(x.visitors)}</td>
                <td className="text-right align-top tabular-nums">{int.format(x.bots)}</td>
                <td className="text-right align-top tabular-nums">{x.visitors + x.bots === 0 ? <Empty /> : pct.format(x.bots / (x.visitors + x.bots))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-base-content/60">Snippet errors</h2>
      <div className="mb-6 overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Time</th>
              <th>Experiment</th>
              <th>Message</th>
              <th>URL</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            {snippetErrors.length === 0 && (
              <tr>
                <td colSpan={5} className="py-9 text-center text-base-content/60">
                  No snippet errors.
                </td>
              </tr>
            )}
            {snippetErrors.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap align-top tabular-nums">{dateFmt.format(new Date(e.createdAt))}</td>
                <td className="align-top font-mono text-xs">
                  {e.experimentKey}:{e.variantKey}
                </td>
                <td className="max-w-md align-top">
                  <span className="block truncate text-xs text-error">{e.message}</span>
                </td>
                <td className="max-w-xs align-top">{e.url ? <span className="block truncate font-mono text-xs">{e.url}</span> : <Empty />}</td>
                <td className="max-w-xs align-top">{e.userAgent ? <span className="block truncate text-xs text-base-content/60">{e.userAgent}</span> : <Empty />}</td>
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
      <p className="mt-3 text-xs text-base-content/50">Orders, snippet errors and webhook events: last 50 each, newest first. Exposures: all rows, including bots.</p>
    </>
  );
}
