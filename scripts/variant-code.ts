// pnpm variant:code <shop> <experiment-key> <variant-key> [--js <file>|-] [--css <file>|-]  – code save through the service
// layer (contract 4.6: on RUNNING it is a hotfix with CODE_CHANGED_WHILE_RUNNING). "-" clears the field. WP5 brings the UI.
import { readFileSync } from "node:fs";
import prisma from "../app/db.server";
import { saveVariantCode } from "../app/services/experiments.server";
import { normalizeDomain } from "../app/services/shops.server";

const [shopArg, key, variantKey, ...rest] = process.argv.slice(2);
const opt = (flag: string) => {
  const i = rest.indexOf(flag);
  if (i === -1) return undefined;
  const v = rest[i + 1];
  return v === "-" ? null : readFileSync(v, "utf8");
};
if (!shopArg || !key || !variantKey || (!rest.includes("--js") && !rest.includes("--css"))) {
  console.error("usage: pnpm variant:code <shop> <experiment-key> <variant-key> [--js <file>|-] [--css <file>|-]");
  process.exit(1);
}
const shop = await prisma.shop.findUnique({ where: { domain: normalizeDomain(shopArg) } });
const experiment = shop && (await prisma.experiment.findUnique({ where: { shopId_key: { shopId: shop.id, key } }, include: { variants: true } }));
const variant = experiment?.variants.find((v) => v.key === variantKey);
if (!variant) {
  console.error("shop, experiment or variant not found");
  process.exit(1);
}
const { sync, hotfix } = await saveVariantCode(variant.id, { js: opt("--js"), css: opt("--css") }, "script:variant-code");
console.log(`${key}/${variantKey} saved${hotfix ? " (hotfix on RUNNING)" : ""}; ${sync.skipped ? `metafield skipped: ${sync.reason}` : `metafield ${sync.bytes} B`}`);
process.exit(0);
