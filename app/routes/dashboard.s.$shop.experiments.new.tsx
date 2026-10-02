/**
 * Create an experiment. The form **only ever creates a DRAFT** (Joel, 01.10.): starting is a separate, deliberate act
 * on the experiment's own page, where the stopping rule and the QA links are in front of you. There is no Start
 * button here and the salt is not shown — it is generated on save and visible afterwards in Setup.
 *
 * Opened under "All shops" (ADR-0038) the shop is the first field of the form (Figma state 1); opened inside a shop
 * it is simply that shop.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { requireInternal } from "../services/auth.server";
import { ExperimentError, createExperiment, takenExperimentKeys } from "../services/experiments.server";
import {
  emptyExperimentInput,
  fractionToPct,
  parseExperimentForm,
  pctToFraction,
  toStoppingRule,
  toTargeting,
  toTrigger,
  validateExperimentInput,
  type FieldErrors,
} from "../services/experiment-input";
import { planningContext } from "../services/planner.server";
import { listShopsForSwitcher } from "../services/experiment-list.server";
import { resolveShopParam } from "../services/shops.server";
import { ExperimentForm } from "../components/ExperimentForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const shop = await resolveShopParam(params.shop);
  const shops = shop ? [] : await listShopsForSwitcher();
  // Without a shop there is nothing to plan against yet; the card then shows its empty state until one is picked.
  const planning = shop
    ? await planningContext(shop.id)
    : { baseline: null, pace: null, orderStats: { orders: 0, aov: NaN, aovSd: NaN, secondMoment: NaN } };
  const takenKeys = shop ? await takenExperimentKeys(shop.id) : [];
  return { shopParam: params.shop ?? "all", shops, planning, takenKeys };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await requireInternal(request);
  const form = await request.formData();
  const paramShop = await resolveShopParam(params.shop);
  const shopId = paramShop?.id ?? String(form.get("shopId") ?? "");
  if (!shopId) return { errors: { shopId: "Choose a shop." } satisfies FieldErrors };

  const input = parseExperimentForm(form);
  const errors = validateExperimentInput(input, { takenKeys: await takenExperimentKeys(shopId) });
  if (Object.keys(errors).length > 0) return { errors };

  try {
    const experiment = await createExperiment(
      shopId,
      {
        name: input.name,
        key: input.key,
        hypothesis: input.hypothesis || null,
        primaryMetric: input.primaryMetric,
        targeting: toTargeting(input),
        trigger: toTrigger(input),
        hideUntilApplied: input.hideUntilApplied,
        allocation: pctToFraction(input.allocationPct),
        variants: input.variants.map((v, i) => ({
          key: v.key,
          name: v.name || (i === 0 ? "Control" : v.key.toUpperCase()),
          weight: pctToFraction(v.weightPct),
          isControl: i === 0,
          js: i === 0 ? null : v.js || null,
          css: i === 0 ? null : v.css || null,
        })),
        stoppingRule: toStoppingRule(input),
      },
      user.email,
    );
    return redirect(`/dashboard/s/${params.shop}/experiments/${experiment.key}`);
  } catch (err) {
    if (err instanceof ExperimentError) return { errors: { key: err.message } satisfies FieldErrors };
    throw err;
  }
};

export default function NewExperiment() {
  const { shopParam, shops, planning, takenKeys } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const initial = emptyExperimentInput();
  // Figma draws 50/50 as percentages; the model stores 0.5 weights. Round-tripping here keeps the two in step.
  initial.variants = initial.variants.map((v) => ({ ...v, weightPct: fractionToPct(1 / initial.variants.length) }));

  return (
    <ExperimentForm
      mode="new"
      initial={initial}
      shops={shops.length > 0 ? shops : undefined}
      planning={planning}
      takenKeys={takenKeys}
      serverErrors={result?.errors}
      cancelTo={`/dashboard/s/${shopParam}/experiments`}
    />
  );
}
