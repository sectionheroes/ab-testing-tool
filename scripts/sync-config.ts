// pnpm sync:config <shop>  – reserves `server` (4.3) if missing, rebuilds the `client` metafield (4.2) from the RUNNING
// experiments and reads it back.
// Service layer only (no UI yet in WP3); the dashboard and CLI call the same syncShopConfig().
import prisma from "../app/db.server";
import { ensureServerConfig, readConfigMetafield, syncShopConfig } from "../app/services/metafields.server";
import { normalizeDomain } from "../app/services/shops.server";

const domain = normalizeDomain(process.argv[2] ?? "");
const shop = await prisma.shop.findUnique({ where: { domain } });
if (!shop) {
  console.error(`shop ${domain} not found`);
  process.exit(1);
}
const server = await ensureServerConfig(shop.id);
console.log(`server key: ${server.written ? "reserved now" : "already present (or shop not ACTIVE)"}`);
const result = await syncShopConfig(shop.id);
if (result.skipped) {
  console.log(`skipped: ${result.reason}`);
} else {
  const back = await readConfigMetafield(domain);
  console.log(`wrote ${result.bytes} B, ${result.experiments} experiment(s), updatedAt ${result.updatedAt}`);
  console.log(`read back (${back?.updatedAt}): ${back?.value}`);
}
process.exit(0);
