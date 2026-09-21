import type { LoaderFunctionArgs } from "react-router";
import { Outlet, isRouteErrorResponse, useLoaderData, useRouteError, useRouteLoaderData } from "react-router";
import { requireUser } from "../services/auth.server";
import { Shell } from "../components/Shell";

// Non-embedded agency dashboard. Google session only – never touches the Shopify session.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  return { user: { email: user.email, role: user.role } };
};

export default function DashboardLayout() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <Shell user={user}>
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
  return data?.user ? <Shell user={data.user}>{body}</Shell> : <main className="px-10 py-8">{body}</main>;
}
