import { redirect, type LoaderFunctionArgs } from "react-router";

// Shopify opens the app URL with ?shop=…&host=… (managed install); people open it bare.
// No manual shop-domain form (App Store req. 2.3.1).
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.has("shop")) return redirect(`/app?${url.searchParams.toString()}`);
  return redirect("/dashboard");
};
