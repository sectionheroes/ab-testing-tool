// Config delivery (ADR-0013, ADR-0030): the `client` JSON (contract 4.2) lives on the AppInstallation as an app-data
// metafield, which is what Liquid exposes as `app.metafields.<namespace>.<key>` in the theme app extension. Only the
// owning app can read or write it, no extra access scope is needed, and it is invisible in the admin.
// GraphQL shapes validated with the Shopify Dev MCP (2026-07).
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { buildClientConfig, serializeClientConfig, JSON_METAFIELD_LIMIT_BYTES, type ClientConfig } from "./client-config";

/** Liquid path in blocks/embed.liquid is `app.metafields.sh_ab.<key>` – keep the namespace and that path in sync. */
export const CONFIG_NAMESPACE = "sh_ab";
export const CLIENT_KEY = "client";
export const SERVER_KEY = "server";
/** Contract 4.3 – reserved for Phase 3, written once on activation. */
export const SERVER_CONFIG_INITIAL = { v: 1, experiments: {} } as const;

type GraphqlClient = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };

const APP_INSTALLATION_QUERY = `#graphql
  query ShabAppInstallation { currentAppInstallation { id } }`;

const METAFIELDS_SET = `#graphql
  mutation ShabMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key type updatedAt }
      userErrors { field message code }
    }
  }`;

const READ_METAFIELD = `#graphql
  query ShabReadConfig($namespace: String!, $key: String!) {
    currentAppInstallation { id metafield(namespace: $namespace, key: $key) { value updatedAt } }
  }`;

export class MetafieldWriteError extends Error {
  constructor(
    message: string,
    public readonly userErrors: { field?: string[] | null; message: string; code?: string | null }[] = [],
  ) {
    super(message);
  }
}

async function gql<T>(admin: GraphqlClient, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new MetafieldWriteError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new MetafieldWriteError("Empty GraphQL response");
  return body.data;
}

async function appInstallationId(admin: GraphqlClient): Promise<string> {
  const data = await gql<{ currentAppInstallation: { id: string } }>(admin, APP_INSTALLATION_QUERY);
  return data.currentAppInstallation.id;
}

async function setJsonMetafield(admin: GraphqlClient, ownerId: string, key: string, value: string): Promise<{ updatedAt: string }> {
  const data = await gql<{
    metafieldsSet: { metafields: { updatedAt: string }[] | null; userErrors: { field?: string[] | null; message: string; code?: string | null }[] };
  }>(admin, METAFIELDS_SET, { metafields: [{ ownerId, namespace: CONFIG_NAMESPACE, key, type: "json", value }] });
  const { userErrors, metafields } = data.metafieldsSet;
  if (userErrors.length) throw new MetafieldWriteError(`metafieldsSet ${key}: ${userErrors.map((e) => e.message).join("; ")}`, userErrors);
  return { updatedAt: metafields?.[0]?.updatedAt ?? new Date().toISOString() };
}

export async function readConfigMetafield(shopDomain: string, key: string = CLIENT_KEY): Promise<{ value: string; updatedAt: string } | null> {
  const { admin } = await unauthenticated.admin(shopDomain);
  const data = await gql<{ currentAppInstallation: { metafield: { value: string; updatedAt: string } | null } }>(admin, READ_METAFIELD, {
    namespace: CONFIG_NAMESPACE,
    key,
  });
  return data.currentAppInstallation.metafield;
}

export type SyncResult =
  | { skipped: true; reason: string }
  | { skipped: false; bytes: number; experiments: number; updatedAt: string; config: ClientConfig };

/**
 * Builds the `client` config for a shop and writes it. Called on every experiment status change, every code save and on
 * shop activation. A shop that is not ACTIVE is never written (nothing goes to a merchant store before activation).
 * Throws ConfigTooLargeError above the size guard and MetafieldWriteError on Shopify errors – callers decide whether
 * that is fatal (status change: yes, the DB must not say RUNNING while the storefront does not know).
 */
export async function syncShopConfig(shopId: string): Promise<SyncResult> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { experiments: { where: { status: "RUNNING" }, include: { variants: true } } },
  });
  if (!shop) throw new Error(`syncShopConfig: shop ${shopId} not found`);
  if (shop.status !== "ACTIVE") return { skipped: true, reason: `shop is ${shop.status}` };

  const config = buildClientConfig({
    requireConsent: shop.requireConsent,
    experiments: shop.experiments.map((e) => ({
      key: e.key,
      status: e.status,
      allocation: e.allocation,
      salt: e.salt,
      targeting: e.targeting,
      trigger: e.trigger,
      hideUntilApplied: e.hideUntilApplied,
      variants: e.variants.map((v) => ({ key: v.key, weight: v.weight, js: v.js, css: v.css })),
    })),
  });
  const { json, bytes } = serializeClientConfig(config);

  const { admin } = await unauthenticated.admin(shop.domain);
  const ownerId = await appInstallationId(admin);
  const { updatedAt } = await setJsonMetafield(admin, ownerId, CLIENT_KEY, json);
  const pct = ((bytes / JSON_METAFIELD_LIMIT_BYTES) * 100).toFixed(1);
  console.log(`[metafields] ${shop.domain} ${CONFIG_NAMESPACE}.${CLIENT_KEY}: ${bytes} B (${pct}% of ${JSON_METAFIELD_LIMIT_BYTES}), ${config.experiments.length} experiment(s)`);
  return { skipped: false, bytes, experiments: config.experiments.length, updatedAt, config };
}

/** Contract 4.3: reserve the `server` key once. Existing value is never overwritten. */
export async function ensureServerConfig(shopId: string): Promise<{ written: boolean }> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error(`ensureServerConfig: shop ${shopId} not found`);
  if (shop.status !== "ACTIVE") return { written: false };
  const existing = await readConfigMetafield(shop.domain, SERVER_KEY);
  if (existing) return { written: false };
  const { admin } = await unauthenticated.admin(shop.domain);
  const ownerId = await appInstallationId(admin);
  await setJsonMetafield(admin, ownerId, SERVER_KEY, JSON.stringify(SERVER_CONFIG_INITIAL));
  console.log(`[metafields] ${shop.domain} ${CONFIG_NAMESPACE}.${SERVER_KEY}: reserved`);
  return { written: true };
}

/** Activation hook: reserve `server`, write `client`. Best effort – activation itself must not fail on a Shopify hiccup. */
export async function syncOnActivation(shopId: string): Promise<void> {
  try {
    await ensureServerConfig(shopId);
    await syncShopConfig(shopId);
  } catch (err) {
    console.error(`[metafields] sync on activation failed for ${shopId}: ${(err as Error).message}`);
  }
}
