/**
 * The experiments list — Figma `Experiments` 2-21, ADR-0036/0037/0038.
 *
 * Toolbar is the status tabs and a search field. No filter chips and no column dropdown: the list has five columns,
 * and a column picker over five columns is more interface than the thing it configures (DESIGN.md §10).
 *
 * The column is **Conversions**, not Visitors. That is the unit the stopping rule counts (ADR-0036), so it is the
 * number that tells you how far along a test is; visitors say nothing without a baseline conversion rate, and we do
 * not have one for a shop as a whole.
 *
 * Filtering, searching and paging are client-side over the loader's rows (DESIGN.md §8). A shop has a handful of
 * tests, not thousands, and the expensive part was the aggregation, which already happened.
 */
import { useMemo, useState } from "react";
import type { ExperimentStatus } from "@prisma/client";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { requireInternal } from "../services/auth.server";
import { listExperiments, type ExperimentRow, type ResultCell } from "../services/experiment-list.server";
import { resolveShopParam } from "../services/shops.server";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Pagination, SearchInput, Tab } from "../components/Controls";
import { Progress } from "../components/Progress";
import { Cell, HeadCell, TableFrame } from "../components/Table";
import { Tooltip } from "../components/Tooltip";
import { Plus } from "../components/icons";
import { glossary } from "../lib/glossary";

const PAGE_SIZE = 20;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const shop = await resolveShopParam(params.shop);
  const rows = await listExperiments({ shopId: shop?.id ?? null });
  return { rows, shopParam: params.shop ?? "all", allShops: shop === null };
};

const TABS: { value: "all" | ExperimentStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "RUNNING", label: "Running" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "Draft" },
  { value: "ENDED", label: "Ended" },
];

const STATUS_BADGE = {
  RUNNING: { tone: "success" as const, dot: true, label: "running" },
  PAUSED: { tone: "warning" as const, dot: false, label: "paused" },
  DRAFT: { tone: "draft" as const, dot: false, label: "draft" },
  ENDED: { tone: "info" as const, dot: false, label: "ended" },
};

const int = new Intl.NumberFormat("de-DE");
const pct = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const dayShortFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const day = (iso: string) => dayFmt.format(new Date(iso));

const Dash = () => <span className="text-base-content/30">—</span>;

export default function ExperimentsList() {
  const { rows, shopParam, allShops } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | ExperimentStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const by = { all: rows.length, RUNNING: 0, PAUSED: 0, DRAFT: 0, ENDED: 0 } as Record<string, number>;
    for (const r of rows) by[r.status]++;
    return by;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === "all" || r.status === tab) &&
        (q === "" || r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q) || r.shop.name.toLowerCase().includes(q)),
    );
  }, [rows, tab, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Experiments">
        <Button
          size="md"
          icon={<Plus size={16} />}
          onClick={() => navigate(`/dashboard/s/${shopParam}/experiments/new`)}
        >
          New experiment
        </Button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-base-300">
        <nav className="-mb-px flex items-end gap-1 overflow-x-auto" aria-label="Status">
          {TABS.map((t) => (
            <Tab key={t.value} active={tab === t.value} count={counts[t.value] ?? 0} onClick={() => reset(setTab)(t.value)}>
              {t.label}
            </Tab>
          ))}
        </nav>
        <SearchInput
          className="mb-2 w-full max-w-xs"
          placeholder="Search experiments"
          aria-label="Search experiments"
          value={query}
          onChange={(e) => reset(setQuery)(e.currentTarget.value)}
        />
      </div>

      <TableFrame>
        <thead>
          <tr className="border-b border-base-300">
            <HeadCell className="pl-4">Experiment</HeadCell>
            <HeadCell>Status</HeadCell>
            <HeadCell>Runtime</HeadCell>
            <HeadCell align="right">Conversions</HeadCell>
            <HeadCell className="w-[260px]">Result</HeadCell>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="py-12 text-center text-sm text-base-content/60">
                {rows.length === 0 ? "No experiments yet." : "Nothing matches."}
              </td>
            </tr>
          )}
          {visible.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-base-300/60 transition-colors last:border-0 hover:bg-base-content/[0.03]"
              onClick={() => navigate(`/dashboard/s/${shopParam}/experiments/${row.key}`)}
            >
              <Cell className="pl-4" sub={allShops ? row.shop.name : undefined}>
                <Link
                  to={`/dashboard/s/${shopParam}/experiments/${row.key}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-base-content hover:underline"
                >
                  {row.name}
                </Link>
              </Cell>
              <Cell>
                <Badge tone={STATUS_BADGE[row.status].tone} dot={STATUS_BADGE[row.status].dot}>
                  {STATUS_BADGE[row.status].label}
                </Badge>
              </Cell>
              <Cell sub={runtimeSub(row)}>{row.runtimeDays === null ? <Dash /> : `${int.format(row.runtimeDays)} days`}</Cell>
              <Cell align="right" className="tabular-nums">
                {row.conversions === null ? <Dash /> : int.format(row.conversions)}
              </Cell>
              <ResultColumn result={row.result} />
            </tr>
          ))}
        </tbody>
      </TableFrame>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-base-content/50">
          {filtered.length === 0
            ? "No experiments"
            : `${int.format((current - 1) * PAGE_SIZE + 1)}–${int.format(Math.min(current * PAGE_SIZE, filtered.length))} of ${int.format(filtered.length)} experiments`}
        </p>
        <Pagination page={current} pages={pages} onPage={setPage} />
      </div>
    </>
  );
}

function runtimeSub(row: ExperimentRow): string | undefined {
  if (row.status === "DRAFT") return undefined;
  if (row.status === "ENDED" && row.startedAt && row.endedAt) {
    return `${dayShortFmt.format(new Date(row.startedAt))}–${day(row.endedAt)}`;
  }
  if (row.status === "PAUSED" && row.pausedAt) return `paused ${day(row.pausedAt)}`;
  return row.startedAt ? `since ${day(row.startedAt)}` : undefined;
}

/**
 * The Result column. Four shapes, and which one appears is the stopping rule, not a style choice:
 *
 *  - **progress** while the rule is open – the bar is the smaller arm's share of the conversion target, and it stays
 *    neutral grey, because colour is a verdict and there is none yet (ADR-0037, DESIGN.md §7 "Progress");
 *  - **srm** – a broken assignment switches the verdict off entirely, so the row says that instead of a number;
 *  - **verdict** once the rule is met, or once the experiment has ended and the snapshot carries the decision;
 *  - **none** for a draft.
 */
function ResultColumn({ result }: { result: ResultCell }) {
  if (result.kind === "none") {
    return (
      <Cell>
        <Dash />
      </Cell>
    );
  }

  const tone =
    result.tone === "positive" ? "font-medium text-success" : result.tone === "negative" ? "font-medium text-error" : "text-base-content/90";

  return (
    <td className="px-2.5 py-3.5 align-middle">
      {result.kind === "progress" ? (
        <span className="flex items-center gap-2.5">
          <Progress value={result.progress ?? 0} label="Conversions in the smaller arm" className="w-24 shrink-0" />
          <span className="text-sm tabular-nums text-base-content/90">{result.progress === null ? <Dash /> : pct.format(result.progress)}</span>
        </span>
      ) : (
        <span className={"flex items-center gap-1.5 text-sm " + tone}>
          {result.headline}
          {result.kind === "srm" && <Tooltip text={glossary.srm} label="What does assignment broken mean?" />}
        </span>
      )}
      {result.note && <span className="mt-0.5 block text-xs text-base-content/60">{result.note}</span>}
    </td>
  );
}
