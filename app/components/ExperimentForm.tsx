/**
 * The experiment form — Figma `Experiment form` 2-22, shared by create and edit.
 *
 * Two columns: everything you decide on the left, "When is it decided?" sticky on the right. The right card has
 * exactly **two** inputs (Joel, 01.10.): conversions per variant, and a minimum runtime in whole weeks. Everything
 * else in it is derived and read-only — the detectable lift beside the conversions, the baseline above, the runtime
 * projection below.
 *
 * **The calculator runs one way here.** You enter conversions and read the lift, never the other way round.
 * `lib/stats` still converts in both directions and keeps doing so for the CLI; the UI simply does not offer the
 * second direction, because a form with two fields that overwrite each other is a form people mistrust.
 *
 * **One design bug is fixed rather than copied.** Figma draws "As soon as the page loads" and "When an element
 * scrolls into view" as checkboxes. The trigger is exclusive in the data model (`immediate` | `visible`, contract
 * 4.2), so they are radios here. Only "Hide the page until the variant is ready" is a real checkbox.
 *
 * **Out of scope, deliberately** (Joel, 01.10., plan §9): the "Goals" card with custom goals, the "Also measured"
 * pills and the two goal modals. Custom goals need a backend that does not exist (a `GoalEvent` table, a proxy route,
 * snippet work, a pixel extension). The primary metric stays the three-value select of the `Metric` enum, with the
 * contract-4.8 warning when AOV is picked — and it moves into Basics, because a card called "Goals" holding one
 * select would promise the feature that is not there.
 *
 * Contract 4.6 shows up twice: `locked` on every field that moves buckets while an experiment is RUNNING, and the
 * banner that says saving code on a live test changes it for every future visitor. The real guard is in
 * `experiments.server.ts` — these are its visible half, not its implementation.
 */
import { useEffect, useMemo, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { CodeField } from "./CodeField";
import { Checkbox, FormSection, Input, Radio, Select, Textarea, UnsavedBar } from "./Form";
import { VariantKey } from "./Badge";
import { Tooltip } from "./Tooltip";
import { Pencil, Plus, X } from "./icons";
import { glossary } from "../lib/glossary";
import {
  AOV_WARNING,
  DEVICES,
  DEVICE_LABELS,
  METRICS,
  METRIC_LABELS,
  URL_MATCHES,
  URL_MATCH_LABELS,
  VARIANT_KEYS,
  MAX_VARIANTS,
  slugify,
  validateExperimentInput,
  type ExperimentInput,
  type FieldErrors,
  type MetricKey,
} from "../services/experiment-input";
import { detectableLift, projectRuntime, revenueInputsFor, type OrderStats } from "../services/planner";

export type PlanningData = {
  baseline: { cr: number; source: string } | null;
  pace: { convertersPerDay: number; source: string } | null;
  orderStats: OrderStats;
};

export type ShopOption = { id: string; domain: string; name: string };

const int = new Intl.NumberFormat("de-DE");
const pct1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export function ExperimentForm({
  mode,
  initial,
  status = "DRAFT",
  shops,
  planning,
  takenKeys,
  serverErrors,
  cancelTo,
}: {
  mode: "new" | "edit";
  initial: ExperimentInput;
  status?: "DRAFT" | "RUNNING" | "PAUSED" | "ENDED";
  /** Only set when the form was opened from "All shops" – then the shop is the first field (Figma state 1). */
  shops?: ShopOption[];
  planning: PlanningData;
  takenKeys: string[];
  serverErrors?: FieldErrors;
  cancelTo: string;
}) {
  const [input, setInput] = useState<ExperimentInput>(initial);
  const [editKey, setEditKey] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [baseline, setBaseline] = useState<BaselineState>(() =>
    planning.baseline ? { mode: "derived", visitors: "", crPct: "" } : { mode: "visitors", visitors: "", crPct: "" },
  );
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const locked = status === "RUNNING";
  const set = <K extends keyof ExperimentInput>(key: K, value: ExperimentInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  // The key follows the name until it is saved once or edited by hand; after the first start it can never change at
  // all (contract 4.1 – it is part of the cart attribute of every order already placed).
  const keyFollowsName = mode === "new" && !editKey;
  useEffect(() => {
    if (keyFollowsName) setInput((prev) => ({ ...prev, key: slugify(prev.name) }));
  }, [input.name, keyFollowsName]);

  const clientErrors = useMemo(() => validateExperimentInput(input, { takenKeys }), [input, takenKeys]);
  const errors: FieldErrors = showErrors ? { ...clientErrors, ...serverErrors } : { ...(serverErrors ?? {}) };
  const dirty = useMemo(() => JSON.stringify(input) !== JSON.stringify(initial), [input, initial]);

  const plan = usePlan(input, planning, baseline);

  return (
    <Form
      method="post"
      // The browser's own validation is off on purpose: it blocks the submit with an untranslated bubble before our
      // handler ever runs, and the inline errors under the field are the design (plan WP5a, DESIGN.md §7).
      noValidate
      onSubmit={(e) => {
        setShowErrors(true);
        if (Object.keys(clientErrors).length > 0) e.preventDefault();
      }}
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{mode === "new" ? "New experiment" : input.name || "Experiment"}</h1>
          {mode === "edit" && <p className="mt-1 font-mono text-xs text-base-content/50">{initial.key}</p>}
        </div>
        {mode === "new" && (
          <div className="flex items-center gap-2">
            <Button type="button" styleName="ghost" size="md" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" styleName="primary" size="md" disabled={saving}>
              {saving ? "Saving…" : "Save as draft"}
            </Button>
          </div>
        )}
      </header>

      {mode === "edit" && dirty && <UnsavedBar saving={saving} onDiscard={() => setInput(initial)} />}

      {locked && (
        <Alert kind="warning">
          This experiment is live. Saving changes the variant for all future visitors and taints the results. Pages,
          devices, trigger, traffic share and splits are locked while it runs — pause it to change those.
        </Alert>
      )}
      {status === "PAUSED" && (
        <Alert kind="warning">This experiment is paused. Nothing is collected until it runs again.</Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          {shops && shops.length > 0 && (
            <FormSection title="Shop">
              <Select name="shopId" label="Shop" defaultValue="" error={errors.shopId}>
                <option value="" disabled>
                  Choose a shop
                </option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormSection>
          )}

          <FormSection title="Basics">
            <Input
              name="name"
              label="Name"
              value={input.name}
              onChange={(e) => set("name", e.currentTarget.value)}
              placeholder="e.g. PDP: Reviews above price"
              error={errors.name}
              className="mb-3.5"
            />

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-base-content/60">
                Key <Tooltip text={glossary.key} label="What is a key?" />
              </span>
              {editKey || locked ? (
                <input
                  name="key"
                  value={input.key}
                  onChange={(e) => set("key", e.currentTarget.value.toLowerCase())}
                  disabled={locked}
                  className="rounded-md border border-border-strong bg-base-200 px-2 py-1 font-mono text-xs text-base-content outline-none focus:border-base-content/50 disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50"
                />
              ) : (
                <>
                  <input type="hidden" name="key" value={input.key} />
                  <span className="font-mono text-base-content/80">{input.key || "—"}</span>
                  <button
                    type="button"
                    onClick={() => setEditKey(true)}
                    aria-label="Edit key"
                    className="text-base-content/40 transition-colors hover:text-base-content"
                  >
                    <Pencil size={13} />
                  </button>
                </>
              )}
              {errors.key && <span className="w-full text-xs text-error">{errors.key}</span>}
            </div>

            <Textarea
              name="hypothesis"
              label="Hypothesis"
              rows={3}
              value={input.hypothesis}
              onChange={(e) => set("hypothesis", e.currentTarget.value)}
              placeholder="If we … then … because …"
              className="mb-3.5"
            />

            <Select
              name="primaryMetric"
              label="Primary – decides the test"
              value={input.primaryMetric}
              onChange={(e) => set("primaryMetric", e.currentTarget.value as MetricKey)}
              className="max-w-xs"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </Select>
            {/* Contract 4.8 asks for this warning in so many words, so it stays visible instead of moving into a
                tooltip (DESIGN.md §10 names exactly this case as its exception). */}
            {input.primaryMetric === "AOV" && (
              <div className="mt-3">
                <Alert kind="warning">{AOV_WARNING}</Alert>
              </div>
            )}
          </FormSection>

          <FormSection title="Where it runs">
            <div className="mb-4">
              <span className="mb-1.5 block text-sm text-base-content/60">Pages</span>
              <div className="flex flex-wrap items-start gap-2">
                <Select
                  name="urlMatch"
                  value={input.urlMatch}
                  onChange={(e) => set("urlMatch", e.currentTarget.value as ExperimentInput["urlMatch"])}
                  locked={locked}
                  className="w-48 shrink-0"
                  aria-label="URL rule"
                >
                  {URL_MATCHES.map((m) => (
                    <option key={m} value={m}>
                      {URL_MATCH_LABELS[m]}
                    </option>
                  ))}
                </Select>
                <Input
                  name="urlValue"
                  value={input.urlValue}
                  onChange={(e) => set("urlValue", e.currentTarget.value)}
                  locked={locked}
                  mono
                  placeholder="/products/"
                  error={errors.urlValue}
                  className="min-w-[200px] flex-1"
                  aria-label="URL value"
                />
              </div>
            </div>

            <fieldset className="mb-4">
              <legend className="pb-1.5 text-sm text-base-content/60">Devices</legend>
              <div className="flex flex-wrap items-center gap-5">
                {DEVICES.map((d) => (
                  <Checkbox
                    key={d}
                    name={`device.${d}`}
                    label={DEVICE_LABELS[d]}
                    checked={input.devices.includes(d)}
                    disabled={locked}
                    onChange={(e) =>
                      set("devices", e.currentTarget.checked ? [...input.devices, d] : input.devices.filter((x) => x !== d))
                    }
                  />
                ))}
              </div>
              {errors.devices && <p className="mt-1.5 text-xs text-error">{errors.devices}</p>}
            </fieldset>

            <fieldset className="mb-4">
              <legend className="flex items-center gap-1.5 pb-1.5 text-sm text-base-content/60">
                Count a visitor <Tooltip text={glossary.trigger} label="When does a visitor count?" />
              </legend>
              {/* Radios, not checkboxes: the trigger is exclusive in the data model (contract 4.2). Figma draws
                  checkboxes here, which would allow a state the snippet cannot represent. */}
              {/* One per line: these are two alternatives, and side by side they read as a pair of checkboxes
                  again – which is the drawing bug this fixes. */}
              <div className="mb-2">
                <Radio
                  name="triggerType"
                  value="immediate"
                  label="As soon as the page loads"
                  checked={input.triggerType === "immediate"}
                  disabled={locked}
                  onChange={() => set("triggerType", "immediate")}
                />
              </div>
              <div>
                <Radio
                  name="triggerType"
                  value="visible"
                  label="When an element scrolls into view"
                  checked={input.triggerType === "visible"}
                  disabled={locked}
                  onChange={() => set("triggerType", "visible")}
                />
              </div>
              {input.triggerType === "visible" && (
                <Input
                  name="triggerSelector"
                  value={input.triggerSelector}
                  onChange={(e) => set("triggerSelector", e.currentTarget.value)}
                  locked={locked}
                  mono
                  size="sm"
                  placeholder=".product__rating"
                  error={errors.triggerSelector}
                  className="ml-6 mt-2 max-w-md"
                  aria-label="Selector that has to come into view"
                />
              )}
            </fieldset>

            <Checkbox
              name="hideUntilApplied"
              checked={input.hideUntilApplied}
              disabled={locked}
              onChange={(e) => set("hideUntilApplied", e.currentTarget.checked)}
              label={
                <span className="flex items-center gap-1.5">
                  Hide the page until the variant is ready <Tooltip text={glossary.hideUntilApplied} label="What does hiding the page do?" />
                </span>
              }
            />
          </FormSection>

          <VariantsSection input={input} setInput={setInput} errors={errors} locked={locked} />
        </div>

        <DecisionCard input={input} setInput={setInput} planning={planning} baseline={baseline} setBaseline={setBaseline} plan={plan} errors={errors} />
      </div>

      {mode === "edit" && (
        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" styleName="primary" size="md" disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Link to={cancelTo} className="text-sm text-base-content/60 hover:text-base-content hover:underline">
            Cancel
          </Link>
        </div>
      )}
    </Form>
  );
}

/* ── Variants ────────────────────────────────────────────────────────────── */

function VariantsSection({
  input,
  setInput,
  errors,
  locked,
}: {
  input: ExperimentInput;
  setInput: (fn: (prev: ExperimentInput) => ExperimentInput) => void;
  errors: FieldErrors;
  locked: boolean;
}) {
  const setVariant = (i: number, patch: Partial<ExperimentInput["variants"][number]>) =>
    setInput((prev) => ({ ...prev, variants: prev.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));

  const addVariant = () =>
    setInput((prev) => {
      const key = VARIANT_KEYS[prev.variants.length];
      if (!key) return prev;
      const next = [...prev.variants, { key, name: "", weightPct: 0, js: "", css: "" }];
      // An even split is what people mean by adding an arm; they can still type anything they want afterwards.
      const even = Math.floor(10000 / next.length) / 100;
      return { ...prev, variants: next.map((v, i) => ({ ...v, weightPct: i === next.length - 1 ? +(100 - even * (next.length - 1)).toFixed(2) : even })) };
    });

  const removeVariant = (i: number) =>
    setInput((prev) => {
      const next = prev.variants.filter((_, idx) => idx !== i);
      const even = Math.floor(10000 / next.length) / 100;
      return { ...prev, variants: next.map((v, idx) => ({ ...v, weightPct: idx === next.length - 1 ? +(100 - even * (next.length - 1)).toFixed(2) : even })) };
    });

  return (
    <FormSection title="Variants">
      <input type="hidden" name="variantCount" value={input.variants.length} />

      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-sm text-base-content/60">
          Visitors in test <Tooltip text={glossary.allocation} label="What is visitors in test?" />
        </span>
        <PercentInput
          name="allocationPct"
          value={input.allocationPct}
          onChange={(v) => setInput((prev) => ({ ...prev, allocationPct: v }))}
          locked={locked}
          label="Visitors in test"
        />
      </div>
      {errors.allocationPct && <p className="-mt-2 mb-3 text-right text-xs text-error">{errors.allocationPct}</p>}

      {input.variants.map((variant, i) => (
        <div key={variant.key} className="border-t border-base-300 py-4">
          <input type="hidden" name={`variant.${i}.key`} value={variant.key} />
          <div className="flex items-center gap-3">
            <VariantKey letter={variant.key.toUpperCase()} />
            {variant.key === "a" ? (
              <>
                <input type="hidden" name={`variant.${i}.name`} value={variant.name || "Control"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Control</span>
                  <span className="block text-xs text-base-content/60">Original page, no code</span>
                </span>
              </>
            ) : (
              <input
                name={`variant.${i}.name`}
                value={variant.name}
                onChange={(e) => setVariant(i, { name: e.currentTarget.value })}
                placeholder="What is different here?"
                aria-label={`Name of variant ${variant.key.toUpperCase()}`}
                className="min-w-0 flex-1 rounded-lg border border-border-strong bg-base-200 px-3 py-2 text-sm text-base-content outline-none transition-colors placeholder:text-base-content/40 focus:border-base-content/50"
              />
            )}
            <PercentInput
              name={`variant.${i}.weight`}
              value={variant.weightPct}
              onChange={(v) => setVariant(i, { weightPct: v })}
              locked={locked}
              label={`Share of variant ${variant.key.toUpperCase()}`}
            />
            {variant.key !== "a" && input.variants.length > 2 && !locked && (
              <button
                type="button"
                onClick={() => removeVariant(i)}
                aria-label={`Remove variant ${variant.key.toUpperCase()}`}
                className="text-base-content/30 transition-colors hover:text-error"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {errors[`variant.${i}.name`] && <p className="mt-1.5 text-xs text-error">{errors[`variant.${i}.name`]}</p>}

          {/* The control never carries code – it is the page as it is. Two separate editors, stacked, no tabs
              (Joel, 01.10.): JS and CSS belong to the same change and you read them together. */}
          {variant.key !== "a" && (
            <div className="mt-3 flex flex-col gap-3">
              <CodeField name={`variant.${i}.js`} label="JavaScript" language="javascript" defaultValue={variant.js} placeholder="// runs once the page matches" />
              <CodeField name={`variant.${i}.css`} label="CSS" language="css" defaultValue={variant.css} placeholder="/* injected before the JS runs */" />
            </div>
          )}
        </div>
      ))}

      {errors.weights && <p className="border-t border-base-300 pt-3 text-xs text-error">{errors.weights}</p>}
      {errors.variants && <p className="pt-2 text-xs text-error">{errors.variants}</p>}

      {!locked && input.variants.length < MAX_VARIANTS && (
        <div className="border-t border-base-300 pt-4">
          <Button type="button" styleName="ghost" size="sm" icon={<Plus size={14} />} onClick={addVariant}>
            Add variant
          </Button>
        </div>
      )}
    </FormSection>
  );
}

function PercentInput({
  name,
  value,
  onChange,
  locked,
  label,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
  locked: boolean;
  label: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <input
        name={name}
        type="number"
        min={0}
        max={100}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        disabled={locked}
        aria-label={label}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-16 rounded-lg border border-border-strong bg-base-200 px-2.5 py-1.5 text-right text-sm tabular-nums text-base-content outline-none transition-colors focus:border-base-content/50 disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50"
      />
      <span className="text-sm text-base-content/60">%</span>
    </span>
  );
}

/* ── "When is it decided?" ───────────────────────────────────────────────── */

type BaselineState = { mode: "derived" | "visitors" | "manual"; visitors: number | ""; crPct: number | "" };

type Plan = ReturnType<typeof usePlan>;

/**
 * Everything the right card derives, in one place so the card itself is only layout. All of it is pure arithmetic
 * from `planner.ts`, so it updates while you type — no round trip for a number that is a formula.
 */
function usePlan(input: ExperimentInput, planning: PlanningData, baseline: BaselineState) {
  return useMemo(() => {
    const cr =
      baseline.mode === "derived"
        ? (planning.baseline?.cr ?? null)
        : baseline.mode === "manual"
          ? typeof baseline.crPct === "number" && baseline.crPct > 0 && baseline.crPct < 100
            ? baseline.crPct / 100
            : null
          : typeof baseline.visitors === "number" && baseline.visitors > 0 && planning.orderStats.orders > 0
            ? Math.min(planning.orderStats.orders / baseline.visitors, 0.999)
            : null;

    const revenue = cr !== null ? revenueInputsFor(cr, planning.orderStats) : null;
    const lift = detectableLift({
      metric: input.primaryMetric,
      conversionsPerArm: input.minConversionsPerArm,
      baselineCR: cr,
      revenue,
    });
    const runtime = projectRuntime({
      conversionsPerArm: input.minConversionsPerArm,
      minFullWeeks: input.minFullWeeks,
      convertersPerDay: planning.pace?.convertersPerDay ?? null,
    });
    const endsOn = runtime ? new Date(Date.now() + runtime.days * 86_400_000) : null;
    return { cr, lift, runtime, endsOn };
  }, [input.primaryMetric, input.minConversionsPerArm, input.minFullWeeks, planning, baseline]);
}

function DecisionCard({
  input,
  setInput,
  planning,
  baseline,
  setBaseline,
  plan,
  errors,
}: {
  input: ExperimentInput;
  setInput: (fn: (prev: ExperimentInput) => ExperimentInput) => void;
  planning: PlanningData;
  baseline: BaselineState;
  setBaseline: (value: BaselineState) => void;
  plan: Plan;
  errors: FieldErrors;
}) {
  const liftLabel = input.primaryMetric === "CR" ? "detectable lift" : `detectable lift in ${METRIC_LABELS[input.primaryMetric].toLowerCase()}`;

  return (
    <aside className="rounded-box border border-base-300 bg-base-200 p-5 xl:sticky xl:top-5">
      <h2 className="mb-4 flex items-center gap-1.5 text-base font-semibold">
        When is it decided? <Tooltip text={glossary.stoppingRule} label="How is a test decided?" side="bottom" />
      </h2>

      <BaselineBlock planning={planning} baseline={baseline} setBaseline={setBaseline} cr={plan.cr} />

      <div className="mb-4">
        <span className="mb-1.5 block text-sm text-base-content/60">Conversions per variant</span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            name="minConversionsPerArm"
            type="number"
            min={1}
            step={1}
            value={input.minConversionsPerArm}
            aria-label="Conversions per variant"
            onChange={(e) => setInput((prev) => ({ ...prev, minConversionsPerArm: Number(e.currentTarget.value) }))}
            className="w-24 rounded-lg border border-border-strong bg-base-200 px-3 py-2 text-sm tabular-nums text-base-content outline-none transition-colors focus:border-base-content/50"
          />
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-base-content/60">
            ≈{" "}
            <span className="font-medium text-base-content">{plan.lift ? `${pct1.format(plan.lift.lift * 100)} %` : "—"}</span> {liftLabel}
            <Tooltip
              text={plan.lift?.floor ? glossary.detectableLiftRpv : glossary.detectableLift}
              label="What is a detectable lift?"
              side="bottom"
            />
          </span>
        </div>
        {errors.minConversionsPerArm && <p className="mt-1.5 text-xs text-error">{errors.minConversionsPerArm}</p>}
        {plan.lift === null && (
          <p className="mt-1.5 text-xs text-base-content/50">
            {input.primaryMetric === "CR" ? "Enter a conversion target." : "Shows once this shop has orders to measure against."}
          </p>
        )}
      </div>

      <div className="mb-4">
        <span className="mb-1.5 block text-sm text-base-content/60">Minimum runtime</span>
        <div className="flex items-center gap-3">
          <input
            name="minFullWeeks"
            type="number"
            min={1}
            max={52}
            step={1}
            value={input.minFullWeeks}
            aria-label="Minimum runtime in full weeks"
            onChange={(e) => setInput((prev) => ({ ...prev, minFullWeeks: Number(e.currentTarget.value) }))}
            className="w-20 rounded-lg border border-border-strong bg-base-200 px-3 py-2 text-sm tabular-nums text-base-content outline-none transition-colors focus:border-base-content/50"
          />
          <span className="text-sm text-base-content/60">full weeks</span>
        </div>
        {errors.minFullWeeks && <p className="mt-1.5 text-xs text-error">{errors.minFullWeeks}</p>}
      </div>

      <div className="border-t border-base-300 pt-4">
        {plan.runtime === null ? (
          <>
            <p className="text-2xl font-semibold text-base-content/30">—</p>
            <p className="mt-1 text-xs text-base-content/50">Shows after this shop&rsquo;s first test</p>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              {/* Amber past six weeks: the futility warning of ADR-0036. A warning, never a block – the tool does
                  not stop a test by itself. */}
              <span className={"text-2xl font-semibold " + (plan.runtime.futility ? "text-warning" : "text-base-content")}>
                ~{int.format(plan.runtime.weeks)} weeks
              </span>
              {plan.endsOn && <span className="text-sm text-base-content/60">ends around {dateFmt.format(plan.endsOn)}</span>}
            </p>
            {/* Named, not implied: the pace comes from one earlier test, and a different targeting makes it wrong. */}
            <p className="mt-1 flex items-center gap-1.5 text-xs text-base-content/50">
              at the pace of your last test in this shop
              <Tooltip text={glossary.runtimeEstimate} label="How is the runtime estimated?" side="bottom" />
            </p>
            {plan.runtime.futility && (
              <div className="mt-3">
                <Alert kind="warning">That is long. Raise the detectable lift or run it on more pages.</Alert>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * The baseline conversion rate. Three states, and which one you get depends on what the shop can tell us:
 *
 *  - **derived** – an earlier test in this shop, named as the source. No input at all.
 *  - **visitors** – the shop's first test (Figma state 5): you type the last 30 days of visitors, we count the orders
 *    ourselves, and the conversion rate falls out of the two.
 *  - **manual** – you type the rate.
 *
 * It only ever moves the runtime estimate and the detectable lift for the revenue metrics. It is never stored on the
 * experiment and never touches the result.
 */
function BaselineBlock({
  planning,
  baseline,
  setBaseline,
  cr,
}: {
  planning: PlanningData;
  baseline: BaselineState;
  setBaseline: (value: BaselineState) => void;
  cr: number | null;
}) {
  if (baseline.mode === "derived" && planning.baseline) {
    return (
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-2 text-sm text-base-content/60">
            Baseline <span className="font-medium text-base-content">{pct1.format(planning.baseline.cr * 100)} %</span>
          </span>
          <button
            type="button"
            onClick={() => setBaseline({ ...baseline, mode: "manual" })}
            className="text-xs text-base-content/60 transition-colors hover:text-base-content hover:underline"
          >
            Change
          </button>
        </div>
        <p className="mt-0.5 text-xs text-base-content/50">from &ldquo;{planning.baseline.source}&rdquo;</p>
      </div>
    );
  }

  if (baseline.mode === "manual") {
    return (
      <div className="mb-4">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm text-base-content/60">
          Conversion rate <Tooltip text={glossary.baselineCr} label="What is the baseline?" side="bottom" />
        </span>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0.01}
            max={99}
            step={0.1}
            value={baseline.crPct}
            aria-label="Baseline conversion rate in percent"
            onChange={(e) => setBaseline({ ...baseline, crPct: e.currentTarget.value === "" ? "" : Number(e.currentTarget.value) })}
            className="w-24 rounded-lg border border-border-strong bg-base-200 px-3 py-2 text-sm tabular-nums text-base-content outline-none transition-colors focus:border-base-content/50"
          />
          <span className="text-sm text-base-content/60">%</span>
        </div>
        {planning.baseline && (
          <button
            type="button"
            onClick={() => setBaseline({ ...baseline, mode: "derived" })}
            className="mt-1.5 text-xs text-base-content/60 underline transition-colors hover:text-base-content"
          >
            Use &ldquo;{planning.baseline.source}&rdquo; instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm text-base-content/60">
        Visitors in the last 30 days <Tooltip text={glossary.baselineCr} label="What is the baseline?" side="bottom" />
      </span>
      <input
        type="number"
        min={1}
        step={1000}
        value={baseline.visitors}
        aria-label="Visitors in the last 30 days"
        placeholder="e.g. 90.000"
        onChange={(e) => setBaseline({ ...baseline, visitors: e.currentTarget.value === "" ? "" : Number(e.currentTarget.value) })}
        className="w-full rounded-lg border border-border-strong bg-base-200 px-3 py-2 text-sm tabular-nums text-base-content outline-none transition-colors placeholder:text-base-content/40 focus:border-base-content/50"
      />
      <p className="mt-1.5 text-xs text-base-content/50">
        {planning.orderStats.orders > 0 ? (
          <>
            We count the orders ourselves ({int.format(planning.orderStats.orders)} in that window).{" "}
            {cr !== null && <span className="text-base-content/70">That is {pct1.format(cr * 100)} %.</span>}{" "}
          </>
        ) : (
          <>No orders in that window yet. </>
        )}
        <button
          type="button"
          onClick={() => setBaseline({ ...baseline, mode: "manual" })}
          className="underline transition-colors hover:text-base-content"
        >
          Or enter the conversion rate directly.
        </button>
      </p>
    </div>
  );
}
