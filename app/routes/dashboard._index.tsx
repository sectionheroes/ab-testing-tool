import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "../services/auth.server";
import { isInternal } from "../services/auth.rules";
import { RememberedShopRedirect } from "../components/RememberedShopRedirect";

// The landing route after login. A CLIENT never gets here – `requireUser` sends them to their shop or to
// "Nothing here yet" (plan §1, client view is phase 2).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  return { internal: isInternal(user.role) };
};

export default function DashboardIndex() {
  return <RememberedShopRedirect section="experiments" />;
}
