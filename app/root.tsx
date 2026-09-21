import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation } from "react-router";
import appStylesHref from "./app.css?url";

// DESIGN.md §2/§3: Inter from Google Fonts, theme attribute set before the stylesheet paints.
export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
  { rel: "stylesheet", href: appStylesHref },
];

export const loader = ({ request }: LoaderFunctionArgs) => {
  // Only the embedded merchant routes need App Bridge; the agency dashboard never loads it.
  const embedded = new URL(request.url).pathname.startsWith("/app");
  return { apiKey: embedded ? process.env.SHOPIFY_API_KEY || "" : null };
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const embedded = useLocation().pathname.startsWith("/app");
  return (
    <html lang="en">
      <head>
        {/* App Bridge must be the first script in <head> on embedded pages (App Store req. 1.1.1 / 2.2.3). */}
        {embedded && apiKey && <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
