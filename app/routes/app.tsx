import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Embedded merchant page layout (ADR-0029): Polaris Web Components only. App Bridge and polaris.js are
// injected by root.tsx for /app/* – no AppProvider, no Tailwind/daisyUI, nothing from app/components.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function App() {
  return <Outlet />;
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
