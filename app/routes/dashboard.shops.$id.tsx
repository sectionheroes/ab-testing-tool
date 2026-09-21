import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireUser } from "../services/auth.server";
import { getShop } from "../services/shops.server";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/Shell";
import { StatusBadge } from "../components/StatusBadge";

// Shop detail – CLIENT users land here (guard in auth.server.ts). Real content comes with WP5 / Phase 2.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireUser(request);
  const shop = await getShop(params.id!);
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return { shop: { id: shop.id, domain: shop.domain, name: shop.name, status: shop.status } };
};

export default function ShopDetail() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader title={shop.name}>
        <StatusBadge status={shop.status} />
      </PageHeader>
      <p className="mb-5 text-sm text-base-content/60">{shop.domain}</p>
      <EmptyState title="Nothing here yet">Experiments and results for this shop arrive with the next work packages.</EmptyState>
    </>
  );
}
