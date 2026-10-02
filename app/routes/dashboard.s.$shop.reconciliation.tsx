import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireInternal } from "../services/auth.server";
import { resolveShopParam } from "../services/shops.server";
import { listReconciliationRuns } from "../services/reconciliation-list.server";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/Shell";

// Reconciliation follows the shop switcher (ADR-0038). The runs themselves are produced by /jobs/reconcile in WP6;
// until that job exists the table is simply empty, which is the honest state rather than a placeholder page.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const shop = await resolveShopParam(params.shop);
  const runs = await listReconciliationRuns(shop?.id ?? null);
  return { runs, allShops: shop === null };
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" });
const int = new Intl.NumberFormat("de-DE");
const money = (amount: string) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));

export default function Reconciliation() {
  const { runs, allShops } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader title="Reconciliation" />
      {runs.length === 0 ? (
        <EmptyState title="No runs yet">Reconciliation runs once a day as soon as the job is scheduled.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Day</th>
                {allShops && <th>Shop</th>}
                <th className="text-right">Orders here</th>
                <th className="text-right">Orders at Shopify</th>
                <th className="text-right">Revenue here</th>
                <th className="text-right">Revenue at Shopify</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="whitespace-nowrap align-top tabular-nums">{dateFmt.format(new Date(run.date))}</td>
                  {allShops && <td className="align-top">{run.shopName}</td>}
                  <td className="text-right align-top tabular-nums">{int.format(run.ourOrderCount)}</td>
                  <td className="text-right align-top tabular-nums">{int.format(run.shopifyOrderCount)}</td>
                  <td className="text-right align-top tabular-nums">{money(run.ourRevenue)}</td>
                  <td className="text-right align-top tabular-nums">{money(run.shopifyRevenue)}</td>
                  <td className="align-top">
                    <Badge tone={run.status === "OK" ? "success" : "error"}>{run.status === "OK" ? "matches" : "mismatch"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
