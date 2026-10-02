import type { LoaderFunctionArgs } from "react-router";
import { requireInternal } from "../services/auth.server";
import { RememberedShopRedirect } from "../components/RememberedShopRedirect";

// ADR-0038 moved the testing pages under /dashboard/s/:shop/. This keeps old links and bookmarks working.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireInternal(request);
  return null;
};

export default function LegacyExperiments() {
  return <RememberedShopRedirect section="experiments" />;
}
