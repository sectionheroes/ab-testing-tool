/**
 * Re-measures the live aggregation and every breakdown dimension against an EXISTING load fixture, without seeding
 * anything. `pnpm seed:load` prints the same numbers right after a seed; this is for iterating on a query afterwards.
 *
 * Reads only. Local Postgres only, like seed-load.ts.
 *
 *   pnpm measure:load [experimentId]
 */
import prisma from "../app/db.server";
import { breakdown, computeExperimentStats, loadExperimentForStats, type BreakdownDimension } from "../app/services/stats.server";

const DIMENSIONS: BreakdownDimension[] = ["day", "device", "visitorType", "channel"];
const RUNS = 5;

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/]+)/)?.[1] ?? "";
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error(`measure-load refuses to touch a non-local database (host "${host}"). Local Postgres only.`);
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${median(xs).toFixed(0).padStart(5)} ms · best ${s[0].toFixed(0)} ms · worst ${s[s.length - 1].toFixed(0)} ms`;
};
const flag = (xs: number[]) => (median(xs) < 500 ? "ok" : "OVER BUDGET");

async function main() {
  assertLocal();
  let experimentId = process.argv[2];
  if (!experimentId) {
    const shop = await prisma.shop.findFirst({ where: { domain: { startsWith: "loadtest-" } }, orderBy: { createdAt: "desc" } });
    if (!shop) throw new Error("no loadtest-* shop found – run `pnpm seed:load` first");
    const experiment = await prisma.experiment.findFirstOrThrow({ where: { shopId: shop.id } });
    experimentId = experiment.id;
  }
  const experiment = await loadExperimentForStats(experimentId);
  if (!experiment) throw new Error(`experiment ${experimentId} not found`);

  const exposures = await prisma.exposure.count({ where: { experimentId } });
  const orders = await prisma.orderAttribution.count({ where: { experimentId } });
  const withVid = await prisma.orderAttribution.count({ where: { experimentId, visitorId: { not: null } } });
  console.log(
    `${experiment.shop.domain} · ${exposures.toLocaleString("de-DE")} exposures · ${orders.toLocaleString("de-DE")} attributed orders ` +
      `(${((withVid / Math.max(orders, 1)) * 100).toFixed(0)} % with _ab_v)\n`,
  );

  const time = async (label: string, fn: () => Promise<unknown>) => {
    const runs: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      await fn();
      runs.push(performance.now() - start);
    }
    console.log(`  ${label.padEnd(22)} ${fmt(runs)} · ${flag(runs)}`);
  };

  console.log("evaluate() – the main aggregation:");
  await time("computeExperimentStats", () => computeExperimentStats(experimentId));

  console.log("\nbreakdown(dimension):");
  for (const dimension of DIMENSIONS) await time(dimension, () => breakdown(experiment, dimension));

  console.log("\nbreakdown(dimension × day):");
  for (const dimension of DIMENSIONS.filter((d) => d !== "day")) {
    await time(dimension, () => breakdown(experiment, dimension, { byDay: true }));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
