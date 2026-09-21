import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation } from "react-router";
import appStylesHref from "./app.css?url";

const isEmbedded = (pathname: string) => pathname === "/app" || pathname.startsWith("/app/");

export const loader = ({ request }: LoaderFunctionArgs) => {
  // Only the embedded merchant routes need App Bridge; the agency dashboard never loads it.
  const embedded = isEmbedded(new URL(request.url).pathname);
  return { apiKey: embedded ? process.env.SHOPIFY_API_KEY || "" : null };
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const embedded = isEmbedded(useLocation().pathname);
  return (
    <html lang="en">
      <head>
        {/* App Bridge must be the first script in <head> on embedded pages (App Store req. 1.1.1 / 2.2.3).
            Polaris web components (<s-*>) come from the separate polaris.js script (ADR-0029). */}
        {embedded && apiKey && <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />}
        {embedded && <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* DESIGN.md §2/§3 (dashboard + login only): Inter from Google Fonts, theme attribute set before the stylesheet paints.
            /app/* is Polaris-only – no Tailwind/daisyUI, no theme script. */}
        {!embedded && (
          <>
            <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
            <link rel="stylesheet" href={appStylesHref} />
          </>
        )}
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
