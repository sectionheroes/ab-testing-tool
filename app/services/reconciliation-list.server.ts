/**
 * The reconciliation table (plan WP5a). The runs are written by `/jobs/reconcile` in WP6; this only reads them, so
 * the page exists and is shop-scoped from now on instead of appearing later with the job.
 */
import prisma from "../db.server";

export type ReconciliationRow = {
  id: string;
  shopName: string;
  date: string;
  ourOrderCount: number;
  shopifyOrderCount: number;
  ourRevenue: string;
  shopifyRevenue: string;
  status: "OK" | "MISMATCH";
};

export async function listReconciliationRuns(shopId: string | null, take = 60): Promise<ReconciliationRow[]> {
  const runs = await prisma.reconciliationRun.findMany({
    where: shopId ? { shopId } : {},
    orderBy: { date: "desc" },
    take,
    include: { shop: { select: { name: true } } },
  });
  return runs.map((r) => ({
    id: r.id,
    shopName: r.shop.name,
    date: r.date.toISOString(),
    ourOrderCount: r.ourOrderCount,
    shopifyOrderCount: r.shopifyOrderCount,
    ourRevenue: r.ourRevenue.toString(),
    shopifyRevenue: r.shopifyRevenue.toString(),
    status: r.status,
  }));
}
