// pnpm seed:experiment <shop-domain> [key]  – upserts a RUNNING experiment with variants a (control) / b, 50/50.
// WP2 helper: there is no dashboard form yet, but attribution needs an experiment to match. Script, not a migration.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const domain = process.argv[2]?.trim().toLowerCase();
const key = (process.argv[3] ?? "demo-test").trim();
if (!domain || !domain.endsWith(".myshopify.com") || !/^[a-z0-9-]+$/.test(key)) {
  console.error("usage: pnpm seed:experiment <shop>.myshopify.com [experiment-key]");
  process.exit(1);
}

const prisma = new PrismaClient();
const shop = await prisma.shop.findUnique({ where: { domain } });
if (!shop) {
  console.error(`shop ${domain} not found`);
  process.exit(1);
}

const experiment = await prisma.experiment.upsert({
  where: { shopId_key: { shopId: shop.id, key } },
  update: { status: "RUNNING", startedAt: new Date(), endedAt: null },
  create: {
    shopId: shop.id,
    key,
    name: "Demo test (WP2 seed)",
    hypothesis: "Seeded experiment so orders/create has something to attribute to.",
    type: "CODE",
    status: "RUNNING",
    allocation: 1,
    salt: randomBytes(8).toString("hex"),
    targeting: {},
    trigger: { type: "immediate" },
    primaryMetric: "CR",
    startedAt: new Date(),
    variants: {
      create: [
        { key: "a", name: "Control", weight: 0.5, isControl: true },
        { key: "b", name: "Variant B", weight: 0.5, isControl: false },
      ],
    },
  },
  include: { variants: true },
});
console.log(`RUNNING: ${experiment.key} (${experiment.id}) variants ${experiment.variants.map((v) => `${v.key}=${v.id}`).join(", ")}`);
await prisma.$disconnect();
