/**
 * Edit an experiment — contract 4.6 in the user interface.
 *
 * While an experiment is RUNNING the code fields stay editable, because a broken variant on a live storefront has to
 * be fixable in seconds. The three consequences come with it: a warning on the form, a `CODE_CHANGED_WHILE_RUNNING`
 * entry in the audit log, and an immediate metafield write. Key, pages, devices, trigger, traffic share and splits
 * are locked, because changing any of them moves visitors between buckets mid-test.
 *
 * The stopping rule goes through `setStoppingRule`, never through a copy of its guard here: while RUNNING it may only
 * be **tightened** (ADR-0036), and a second implementation of that comparison is exactly how the back door gets
 * reopened.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { requireInternal } from "../services/auth.server";
import { ExperimentError, setStoppingRule, takenExperimentKeys, updateExperiment } from "../services/experiments.server";
import {
  fractionToPct,
  fromTargeting,
  fromTrigger,
  fullWeeksFromDays,
  parseExperimentForm,
  pctToFraction,
  toStoppingRule,
  toTargeting,
  toTrigger,
  validateExperimentInput,
  type ExperimentInput,
  type FieldErrors,
  type MetricKey,
} from "../services/experiment-input";
import { planningContext } from "../services/planner.server";
import { loadExperimentByKey } from "../services/experiment-detail.server";
import { ExperimentForm } from "../components/ExperimentForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const experiment = await loadExperimentByKey(params.shop, params.key);
  if (experiment.status === "ENDED") throw redirect(`/dashboard/s/${params.shop}/experiments/${experiment.key}`);

  const [planning, takenKeys] = await Promise.all([
    planningContext(experiment.shopId),
    takenExperimentKeys(experiment.shopId, experiment.id),
  ]);

  const initial: ExperimentInput = {
    name: experiment.name,
    key: experiment.key,
    hypothesis: experiment.hypothesis ?? "",
    primaryMetric: experiment.primaryMetric as MetricKey,
    ...fromTargeting(experiment.targeting),
    ...fromTrigger(experiment.trigger),
    hideUntilApplied: experiment.hideUntilApplied,
    allocationPct: fractionToPct(experiment.allocation),
    variants: experiment.variants.map((v) => ({
      key: v.key,
      name: v.name,
      weightPct: fractionToPct(v.weight),
      js: v.js ?? "",
      css: v.css ?? "",
    })),
    minConversionsPerArm: experiment.minConversionsPerArm ?? 0,
    minFullWeeks: fullWeeksFromDays(experiment.minDurationDays),
  };

  return { shopParam: params.shop ?? "all", initial, status: experiment.status, planning, takenKeys };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await requireInternal(request);
  const experiment = await loadExperimentByKey(params.shop, params.key);
  const form = await request.formData();
  const input = parseExperimentForm(form);

  const errors = validateExperimentInput(input, { takenKeys: await takenExperimentKeys(experiment.shopId, experiment.id) });
  if (Object.keys(errors).length > 0) return { errors };

  try {
    // The stopping rule goes **first**, on purpose. It is the one guard that routinely says no (tighten-only while
    // RUNNING, ADR-0036), and running it after the rest would mean the other edits are already committed when it
    // throws – an error message on a page whose changes were half saved.
    await setStoppingRule(experiment.id, toStoppingRule(input), user.email);
    await updateExperiment(
      experiment.id,
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
  } catch (err) {
    if (err instanceof ExperimentError) {
      return { errors: { form: err.message } satisfies FieldErrors };
    }
    throw err;
  }
  return redirect(`/dashboard/s/${params.shop}/experiments/${input.key}`);
};

export default function EditExperiment() {
  const { shopParam, initial, status, planning, takenKeys } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <ExperimentForm
      mode="edit"
      initial={initial}
      status={status}
      planning={planning}
      takenKeys={takenKeys}
      serverErrors={result?.errors}
      cancelTo={`/dashboard/s/${shopParam}/experiments/${initial.key}`}
    />
  );
}
