// pnpm experiment:status <shop> <key> <RUNNING|PAUSED|ENDED> [decision]  – status change through the service layer,
// which writes the metafield (kill switch on PAUSED/ENDED). Script, not UI – the dashboard form comes in WP5.
import prisma from "../app/db.server";
import { setExperimentStatus } from "../app/services/experiments.server";
import { readConfigMetafield } from "../app/services/metafields.server";
import { normalizeDomain } from "../app/services/shops.server";

const [shopArg, key, status, decision] = process.argv.slice(2);
if (!shopArg || !key || !["RUNNING", "PAUSED", "ENDED"].includes(status ?? "")) {
  console.error("usage: pnpm experiment:status <shop> <experiment-key> <RUNNING|PAUSED|ENDED> [WINNER|NO_DIFFERENCE|INVALID|ABORTED]");
  process.exit(1);
}
const domain = normalizeDomain(shopArg);
const shop = await prisma.shop.findUnique({ where: { domain } });
if (!shop) {
  console.error(`shop ${domain} not found`);
  process.exit(1);
}
const experiment = await prisma.experiment.findUnique({ where: { shopId_key: { shopId: shop.id, key } } });
if (!experiment) {
  console.error(`experiment ${key} not found on ${domain}`);
  process.exit(1);
}
const t0 = Date.now();
const { experiment: updated, sync } = await setExperimentStatus(experiment.id, status as "RUNNING" | "PAUSED" | "ENDED", "script:experiment-status", {
  decision: decision as "WINNER" | "NO_DIFFERENCE" | "INVALID" | "ABORTED" | undefined,
});
console.log(`synced at ${new Date().toISOString()} (${Date.now()})`);
console.log(`${updated.key}: ${experiment.status} → ${updated.status} (startedAt ${updated.startedAt?.toISOString()}, endedAt ${updated.endedAt?.toISOString() ?? "–"}) in ${Date.now() - t0} ms`);
console.log(sync.skipped ? `metafield skipped: ${sync.reason}` : `metafield: ${sync.bytes} B, ${sync.experiments} experiment(s)`);
const back = await readConfigMetafield(domain);
console.log(`read back: ${back?.value}`);
process.exit(0);
