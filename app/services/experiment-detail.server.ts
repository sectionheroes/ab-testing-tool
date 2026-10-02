/**
 * Loading one experiment by its shop-and-key URL (ADR-0038: `/dashboard/s/:shop/experiments/:key`).
 *
 * The key is unique **per shop**, never globally (contract 4.1 / plan §3), so both halves of the URL are needed to
 * identify a row. Under "All shops" the shop segment is `all` and the key alone has to do — if two shops happen to
 * use the same key, the global list links each row with its own shop's domain instead, which is what
 * `linkShopParam` is for.
 */
import type { Experiment, Variant } from "@prisma/client";
import prisma from "../db.server";
import { ALL_SHOPS } from "./shops.server";

export type ExperimentDetail = Experiment & {
  variants: Variant[];
  shop: { id: string; name: string; domain: string; timezone: string | null };
};

export async function loadExperimentByKey(shopParam: string | undefined, key: string | undefined): Promise<ExperimentDetail> {
  if (!key) throw new Response("Experiment not found", { status: 404 });
  const where =
    !shopParam || shopParam === ALL_SHOPS ? { key } : { key, shop: { domain: shopParam } };
  const experiment = await prisma.experiment.findFirst({
    where,
    include: { variants: { orderBy: { key: "asc" } }, shop: { select: { id: true, name: true, domain: true, timezone: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!experiment) throw new Response("Experiment not found", { status: 404 });
  return experiment;
}

/** The audit log of one experiment – plan WP5a asks for it next to the experiment, not in a global log. */
export function listAuditLog(experimentId: string, take = 50) {
  return prisma.auditLog.findMany({ where: { experimentId }, orderBy: { at: "desc" }, take });
}

/**
 * The QA force links of contract 4.4: `?ab_force=<key>:<variant>` pins a variant for this browser session, sends no
 * exposure and sets no cart attribute.
 *
 * They are shown for **RUNNING and PAUSED only** (Joel, 01.10.). A force link acts on the experiments in the `client`
 * metafield, and by contract 4.2 only RUNNING experiments are written there — so on a DRAFT the link would do
 * nothing at all. Offering a control that provably does not work is worse than not offering it; whether a QA status
 * should exist is a separate decision (STATUS.md, open).
 */
export function forceLinks(domain: string, experimentKey: string, variantKeys: string[]): { variant: string; url: string }[] {
  return variantKeys.map((variant) => ({
    variant,
    url: `https://${domain}/?ab_force=${encodeURIComponent(`${experimentKey}:${variant}`)}`,
  }));
}
