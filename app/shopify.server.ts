import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { env } from "./env.server";
import { ShopSessionStorage } from "./services/session-storage.server";
import { recordInstallDetails } from "./services/shops.server";

const shopify = shopifyApp({
  apiKey: env("SHOPIFY_API_KEY"),
  apiSecretKey: env("SHOPIFY_API_SECRET"),
  apiVersion: ApiVersion.July26,
  scopes: env("SCOPES").split(","),
  appUrl: env("SHOPIFY_APP_URL"),
  authPathPrefix: "/auth",
  // Dynamic import: metafields.server needs `unauthenticated` from this module (circular otherwise).
  sessionStorage: new ShopSessionStorage(prisma, (shopId) => import("./services/metafields.server").then((m) => m.syncOnActivation(shopId))),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Runs after token exchange / install. Shop row already exists (ShopSessionStorage.storeSession);
    // here we only add what needs the Admin API. Nothing is written *to* the shop while PENDING.
    afterAuth: async ({ session, admin }) => {
      try {
        const response = await admin.graphql(
          `#graphql
            query ShabShopDetails { shop { name ianaTimezone } }`,
        );
        const { data } = (await response.json()) as { data?: { shop?: { name: string; ianaTimezone: string } } };
        if (data?.shop) await recordInstallDetails(session.shop, { name: data.shop.name, timezone: data.shop.ianaTimezone });
      } catch (err) {
        console.error("afterAuth: could not read shop details", err);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
