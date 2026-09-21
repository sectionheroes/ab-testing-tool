import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
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
  } catch (err) {
    if (err instanceof ShopError) return { error: err.message };
    throw err;
  }
  // Success: reload the page in its ACTIVE state (search params carry the embedded-app host/shop context).
  return redirect(`/app${new URL(request.url).search}`);
};

// ADR-0029: Polaris Web Components only, every button variant="secondary" – never primary.
export default function MerchantPage() {
  const { name, domain, status, deepLink } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  // React 18 renders `loading={false}` as loading="false" on a custom element, which the web component reads as truthy.
  const submitting = useNavigation().state !== "idle";

  return (
    <s-page heading="sh-ab">
      {status !== "ACTIVE" ? (
        <s-section heading="Activation">
          <s-stack direction="block" gap="base">
            <s-paragraph>This app is operated by Sectionheroes for its clients.</s-paragraph>
            <s-paragraph color="subdued">
              {name} ({domain}) is installed but not activated yet. Enter the activation code you received from Sectionheroes.
            </s-paragraph>
            {result?.error && (
              <s-banner tone="critical" heading="Activation failed">
                {result.error}
              </s-banner>
            )}
            <Form method="post">
              <s-stack direction="block" gap="base">
                <s-text-field label="Activation code" name="code" required autocomplete="off" />
                <s-stack direction="inline">
                  <s-button variant="secondary" type="submit" loading={submitting || undefined}>
                    Activate
                  </s-button>
                </s-stack>
              </s-stack>
            </Form>
          </s-stack>
        </s-section>
      ) : (
        <>
          <s-section heading="Status">
            <s-stack direction="block" gap="base">
              <s-paragraph>This app is operated by Sectionheroes for its clients.</s-paragraph>
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-text color="subdued">{domain}</s-text>
                <s-badge tone="success">Active</s-badge>
              </s-stack>
            </s-stack>
          </s-section>
          <s-section heading="Theme integration">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Tests are delivered through a theme app embed. Enable the <s-text type="strong">Sectionheroes A/B Testing</s-text> app
                embed in the theme editor – nothing changes on your storefront until a test is started.
              </s-paragraph>
              <s-paragraph color="subdued">The app embed will be available soon; until then the theme editor shows no embed for this app.</s-paragraph>
              <s-stack direction="inline">
                <s-button variant="secondary" href={deepLink!} target="_top">
                  Open theme editor
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </>
      )}
      <s-section heading="Contact">
        <s-paragraph>
          Questions? Contact Sectionheroes at <s-link href={`mailto:${CONTACT}`}>{CONTACT}</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
