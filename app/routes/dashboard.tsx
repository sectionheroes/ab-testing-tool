import type { LoaderFunctionArgs } from "react-router";
import { Outlet, isRouteErrorResponse, useLoaderData, useRouteError, useRouteLoaderData } from "react-router";
import { requireUser } from "../services/auth.server";
import { isInternal } from "../services/auth.rules";
import { listShopsForSwitcher } from "../services/experiment-list.server";
import { ALL_SHOPS, Shell } from "../components/Shell";

// Non-embedded agency dashboard. Google session only – never touches the Shopify session.
//
// The shop switcher and its per-shop experiment counts are loaded **here**, in the same round as the page itself
// (ADR-0038) rather than in a fetcher of their own: it is one small query, and a second round trip for the sidebar
// would make every navigation look like it loads twice.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  const shops = isInternal(user.role) ? await listShopsForSwitcher() : [];
  return {
    user: { email: user.email, role: user.role },
    shops,
    shopParam: shopParamFromPath(new URL(request.url).pathname),
  };
};

/**
 * The `:shop` segment of ADR-0038, read off the path rather than off `params`. A layout route only receives the
 * params of its own path pattern, and the shop lives in the child's – so the sidebar would otherwise not know which
 * shop is open and every Testing link would reset the context.
 */
export function shopParamFromPath(pathname: string): string {
  const m = pathname.match(/^\/dashboard\/s\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : ALL_SHOPS;
}

export default function DashboardLayout() {
  const { user, shops, shopParam } = useLoaderData<typeof loader>();
  return (
    <Shell user={user} shops={shops} shopParam={shopParam}>
      <Outlet />
    </Shell>
  );
}

// DESIGN.md §6/§7: the shell stays around errors so navigation keeps working.
export function ErrorBoundary() {
  const error = useRouteError();
  const data = useRouteLoaderData<typeof loader>("routes/dashboard");
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong";
  const detail = isRouteErrorResponse(error) ? String(error.data ?? "") : error instanceof Error ? error.message : String(error);
  const body = (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-base-content/60">The page could not be rendered.</p>
      {detail && <pre className="mt-4 max-w-full overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3 text-xs text-base-content/70">{detail}</pre>}
    </>
  );
  return data?.user ? (
    <Shell user={data.user} shops={data.shops} shopParam={data.shopParam}>
      {body}
    </Shell>
  ) : (
    <main className="px-10 py-8">{body}</main>
  );
}
