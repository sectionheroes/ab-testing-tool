import type { LoaderFunctionArgs } from "react-router";
import { requireInternal } from "../services/auth.server";
import { RememberedShopRedirect } from "../components/RememberedShopRedirect";

// ADR-0038: the shop-scoped route is /dashboard/s/:shop/reconciliation.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireInternal(request);
  return null;
};

export default function LegacyReconciliation() {
  return <RememberedShopRedirect section="reconciliation" />;
}
