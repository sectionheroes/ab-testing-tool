/**
 * The experiment page — **not** the Results page. Results with its five tabs is WP5b (ADR-0037); what lives here is
 * the part WP5a owns: what the test is, the audit log, the QA links, and the two status changes that need no dialog.
 *
 * Start is here rather than in the form (Joel, 01.10.): creating a test and launching it on a live storefront are two
 * decisions, and the second one should be taken in front of the setup and the QA links, not at the bottom of a form.
 *
 * **Stop is deliberately absent.** It requires a decision and a conclusion (plan §3, mandatory), warns when the
 * stopping rule is not met, offers Pause as the alternative, and freezes the result for good (ADR-0025/0036) — that
 * is the WP5b stop dialog, and DESIGN.md has no modal recipe yet (STATUS.md, open). Building half of it here would
 * mean shipping an irreversible action through an interface nobody designed.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireInternal } from "../services/auth.server";
import { ExperimentError, setExperimentStatus } from "../services/experiments.server";
import { forceLinks, listAuditLog, loadExperimentByKey } from "../services/experiment-detail.server";
import { METRIC_LABELS, URL_MATCH_LABELS, fractionToPct, type MetricKey, type UrlMatch } from "../services/experiment-input";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/Alert";
import { Badge, VariantKey } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Tooltip } from "../components/Tooltip";
import { Chart, External, Pause, Pencil, Play } from "../components/icons";
import { glossary } from "../lib/glossary";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const experiment = await loadExperimentByKey(params.shop, params.key);
  const log = await listAuditLog(experiment.id);
  const targeting = (experiment.targeting ?? {}) as { url?: { match?: string; value?: string }; device?: string[] };
  const trigger = (experiment.trigger ?? {}) as { type?: string; selector?: string };

  return {
    shopParam: params.shop ?? "all",
    experiment: {
      id: experiment.id,
      key: experiment.key,
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      status: experiment.status,
      primaryMetric: experiment.primaryMetric as MetricKey,
      allocation: experiment.allocation,
      salt: experiment.salt,
      hideUntilApplied: experiment.hideUntilApplied,
      startedAt: experiment.startedAt?.toISOString() ?? null,
      endedAt: experiment.endedAt?.toISOString() ?? null,
      minConversionsPerArm: experiment.minConversionsPerArm,
      minDurationDays: experiment.minDurationDays,
      requireFullWeeks: experiment.requireFullWeeks,
      targeting,
      trigger,
      shop: experiment.shop,
      variants: experiment.variants.map((v) => ({ key: v.key, name: v.name, weight: v.weight, isControl: v.isControl, hasJs: !!v.js, hasCss: !!v.css })),
    },
    forceLinks:
      experiment.status === "RUNNING" || experiment.status === "PAUSED"
        ? forceLinks(experiment.shop.domain, experiment.key, experiment.variants.map((v) => v.key))
        : [],
    log: log.map((entry) => ({ id: entry.id, at: entry.at.toISOString(), actor: entry.actor, action: entry.action, diff: entry.diff })),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await requireInternal(request);
  const experiment = await loadExperimentByKey(params.shop, params.key);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "start") {
      const { sync } = await setExperimentStatus(experiment.id, "RUNNING", user.email);
      // The metafield write is what actually makes the storefront serve the variant (4.2); say which of the two
      // happened rather than a bare "saved".
      return { ok: sync.skipped ? `Running. The storefront config was not written: ${sync.reason}.` : "Running. The storefront config was updated." };
    }
    if (intent === "pause") {
      await setExperimentStatus(experiment.id, "PAUSED", user.email);
      return { ok: "Paused. Nothing is collected until it runs again." };
    }
    return { error: "Unknown action." };
  } catch (err) {
    if (err instanceof ExperimentError) return { error: err.message };
    throw err;
  }
};

const STATUS_BADGE = {
  RUNNING: { tone: "success" as const, dot: true, label: "running" },
  PAUSED: { tone: "warning" as const, dot: false, label: "paused" },
  DRAFT: { tone: "draft" as const, dot: false, label: "draft" },
  ENDED: { tone: "info" as const, dot: false, label: "ended" },
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const stampFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const int = new Intl.NumberFormat("de-DE");
const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export default function ExperimentDetail() {
  const { shopParam, experiment, forceLinks: links, log } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";
  const e = experiment;

  const runtime =
    e.startedAt === null
      ? "not started"
      : `${e.status === "ENDED" ? "ran for" : "running for"} ${int.format(
          Math.max(0, Math.round(((e.endedAt ? Date.parse(e.endedAt) : Date.now()) - Date.parse(e.startedAt)) / 86_400_000)),
        )} days, since ${dateFmt.format(new Date(e.startedAt))}`;

  return (
    <>
      <PageHeader title={e.name}>
        <Badge tone={STATUS_BADGE[e.status].tone} dot={STATUS_BADGE[e.status].dot}>
          {STATUS_BADGE[e.status].label}
        </Badge>
        {e.status !== "ENDED" && (
          <Link to={`/dashboard/s/${shopParam}/experiments/${e.key}/edit`}>
            <Button styleName="secondary" size="md" icon={<Pencil size={16} />}>
              Edit
            </Button>
          </Link>
        )}
        {(e.status === "DRAFT" || e.status === "PAUSED") && (
          <Form method="post">
            <Button type="submit" name="intent" value="start" styleName="primary" size="md" icon={<Play size={16} />} disabled={busy}>
              Start
            </Button>
          </Form>
        )}
        {e.status === "RUNNING" && (
          <Form method="post">
            <Button type="submit" name="intent" value="pause" styleName="secondary" size="md" icon={<Pause size={16} />} disabled={busy}>
              Pause
            </Button>
          </Form>
        )}
      </PageHeader>

      <p className="mb-5 text-sm text-base-content/60">
        {METRIC_LABELS[e.primaryMetric]} · {runtime} · {e.shop.name}
      </p>

      {result?.ok && <Alert kind="success">{result.ok}</Alert>}
      {result?.error && <Alert kind="error">{result.error}</Alert>}

      <div className="mb-5 flex items-center gap-3 rounded-box border border-base-300 bg-base-200 px-4 py-3 text-sm text-base-content/60">
        <Chart size={16} className="shrink-0 text-base-content/40" />
        Numbers, charts and the verdict live on the results page, which is built in the next work package.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Setup">
          <Row label="Key" tooltip={glossary.key}>
            <span className="font-mono">{e.key}</span>
          </Row>
          <Row label="Salt" tooltip={glossary.salt}>
            <span className="font-mono">{e.salt}</span>
          </Row>
          <Row label="Pages">
            <span className="font-mono text-xs">
              {URL_MATCH_LABELS[(e.targeting.url?.match ?? "contains") as UrlMatch]} {e.targeting.url?.value ?? "—"}
            </span>
          </Row>
          <Row label="Devices">{(e.targeting.device ?? []).join(", ") || "—"}</Row>
          <Row label="Count a visitor">
            {e.trigger.type === "visible" ? <span className="font-mono text-xs">on sight: {e.trigger.selector}</span> : "on page load"}
          </Row>
          <Row label="Hide until ready">{e.hideUntilApplied ? "yes" : "no"}</Row>
          <Row label="Visitors in test">{pct.format(fractionToPct(e.allocation))} %</Row>
          <Row label="Stopping rule">
            {[
              e.minConversionsPerArm ? `${int.format(e.minConversionsPerArm)} conversions per variant` : null,
              e.minDurationDays ? `${int.format(e.minDurationDays / 7)} full weeks` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "none"}
          </Row>
          {e.hypothesis && (
            <div className="mt-3 border-t border-base-300 pt-3">
              <p className="text-xs uppercase tracking-wider text-base-content/50">Hypothesis</p>
              <p className="mt-1 text-sm leading-relaxed text-base-content/80">{e.hypothesis}</p>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Variants">
            {e.variants.map((v) => (
              <div key={v.key} className="flex items-center gap-3 border-b border-base-300 py-2.5 last:border-0">
                <VariantKey letter={v.key.toUpperCase()} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{v.name}</span>
                  <span className="block text-xs text-base-content/60">
                    {v.isControl ? "Original page, no code" : [v.hasJs ? "JavaScript" : null, v.hasCss ? "CSS" : null].filter(Boolean).join(" + ") || "no code yet"}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-base-content/80">{pct.format(fractionToPct(v.weight))} %</span>
              </div>
            ))}
          </Card>

          {/* Contract 4.4 force links. RUNNING and PAUSED only – a DRAFT is not in the metafield (4.2), so the link
              would have nothing to act on (Joel, 01.10.; STATUS.md keeps the QA-status question open). */}
          {links.length > 0 && (
            <Card title="QA">
              <p className="mb-3 flex items-center gap-1.5 text-xs text-base-content/60">
                Open the shop with one variant forced on <Tooltip text={glossary.forceLink} label="What is a force link?" />
              </p>
              {links.map((link) => (
                <div key={link.variant} className="flex items-center gap-3 border-b border-base-300 py-2 last:border-0">
                  <VariantKey letter={link.variant.toUpperCase()} />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-base-content/70">{link.url}</code>
                  <a href={link.url} target="_blank" rel="noreferrer" className="text-base-content/40 transition-colors hover:text-base-content" aria-label={`Open variant ${link.variant.toUpperCase()}`}>
                    <External size={15} />
                  </a>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-base-content/60">History</h2>
      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">When</th>
              <th>What</th>
              <th>Who</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr>
                <td colSpan={3} className="py-9 text-center text-base-content/60">
                  Nothing has happened yet.
                </td>
              </tr>
            )}
            {log.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap align-top tabular-nums">{stampFmt.format(new Date(entry.at))}</td>
                <td className="align-top">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td className="align-top font-mono text-xs text-base-content/60">{entry.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Edited",
  STATUS_CHANGED: "Status changed",
  CODE_CHANGED_WHILE_RUNNING: "Variant code changed while running",
  STOPPING_RULE_CHANGED: "Stopping rule changed",
};

function Row({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="flex items-center gap-1.5 text-base-content/60">
        {label}
        {tooltip && <Tooltip text={tooltip} label={`What is ${label.toLowerCase()}?`} />}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
