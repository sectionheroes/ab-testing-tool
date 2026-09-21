import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { APP_EMBED_HANDLE, ShopError, activateWithCode, appEmbedDeepLink, getShopByDomain } from "../services/shops.server";

const CONTACT = "hello@sectionheroes.de";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return {
    domain: shop.domain,
    name: shop.name,
    status: shop.status,
    // Block handle `embed` is pinned to extensions/sh-ab-embed/blocks/embed.liquid – WP3 must use that filename.
    deepLink: shop.status === "ACTIVE" ? appEmbedDeepLink(shop.domain) : null,
    embedHandle: APP_EMBED_HANDLE,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    await activateWithCode(session.shop, String(form.get("code") ?? ""));
    return { ok: true, error: null };
  } catch (err) {
    if (err instanceof ShopError) return { ok: false, error: err.message };
    throw err;
  }
};

export default function MerchantPage() {
  const { name, domain, status, deepLink } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Sectionheroes A/B Testing</h1>
        <span className={`badge badge-sm ${status === "ACTIVE" ? "badge-soft badge-success" : "badge-soft badge-warning"}`}>
          {status === "ACTIVE" ? "active" : "pending activation"}
        </span>
      </header>

      <section className="rounded-box border border-base-300 bg-base-200 p-5">
        <p className="text-sm">
          This app is operated by <span className="font-medium">Sectionheroes</span> for its clients. It runs A/B tests on your storefront
          that are set up and evaluated by the Sectionheroes team.
        </p>

        {status !== "ACTIVE" && (
          <>
            <p className="mt-3 text-sm text-base-content/60">
              {name} ({domain}) is installed but not activated yet. Enter the activation code you received from Sectionheroes.
            </p>
            {result?.error && (
              <div role="alert" className="alert alert-error alert-soft mt-4 text-sm">
                {result.error}
              </div>
            )}
            <Form method="post" className="mt-4 flex items-end gap-2">
              <label className="block flex-1">
                <span className="mb-1.5 block text-sm text-base-content/60">Activation code</span>
                <input type="password" name="code" required autoComplete="off" className="input w-full" />
              </label>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                Activate
              </button>
            </Form>
          </>
        )}

        {status === "ACTIVE" && (
          <>
            <div className="mt-4 flex items-baseline justify-between gap-4 py-1 text-sm">
              <span className="text-base-content/60">Shop</span>
              <span className="text-right font-medium">{domain}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
              <span className="text-base-content/60">Status</span>
              <span className="text-right font-medium">Active</span>
            </div>
            <h2 className="mt-5 mb-2 text-base font-semibold">Enable the app embed</h2>
            <p className="text-sm text-base-content/60">
              Tests are delivered through a theme app embed. Open the theme editor to turn it on – nothing changes on your storefront until a
              test is started.
            </p>
            <a href={deepLink!} target="_top" rel="noreferrer" className="btn btn-primary btn-sm mt-3">
              Open theme editor
            </a>
          </>
        )}
      </section>

      <p className="mt-5 text-xs text-base-content/50">
        Questions? Contact Sectionheroes at{" "}
        <a href={`mailto:${CONTACT}`} className="hover:underline">
          {CONTACT}
        </a>
        .
      </p>
    </main>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
