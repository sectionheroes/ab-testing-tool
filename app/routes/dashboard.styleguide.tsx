/**
 * /dashboard/styleguide — every component in every variant, in both themes. **Development only.**
 *
 * This is how the design system gets reviewed: one page the designer and Joel can open next to the Figma
 * Foundations page and compare, instead of hunting the components across half-built screens.
 *
 * It refuses to render outside development, so it can never ship to a client-facing deploy. It is also the reason
 * the components take plain props and no context — anything that needed a loader could not be shown here.
 */
import { useState } from "react";
import { data } from "react-router";
import { requireInternal } from "../services/auth.server";
import { PageHeader } from "../components/PageHeader";
import { Badge, BADGE_TONES, VariantKey } from "../components/Badge";
import { Button, BUTTON_SIZES, BUTTON_STYLES, IconButton, buttonIconSize, type ButtonSize, type ButtonStyle } from "../components/Button";
import { AddChip, Chip, DropdownTrigger, Pagination, SearchInput, Segmented, Tab } from "../components/Controls";
import { CodeField } from "../components/CodeField";
import { Checkbox, FormSection, Input, Radio, Select, Textarea, UnsavedBar } from "../components/Form";
import { MobileTopBar } from "../components/MobileTopBar";
import { Progress } from "../components/Progress";
import { ShopSwitcher, type SwitcherShop } from "../components/ShopSwitcher";
import { Cell, HeadCell, TableFrame } from "../components/Table";
import { Tooltip } from "../components/Tooltip";
import { ICONS, Calendar, Plus, Refresh, type IconName } from "../components/icons";

export const loader = async ({ request }: { request: Request }) => {
  await requireInternal(request);
  // Never outside development – a styleguide is a tool, not a page of the product.
  if (process.env.NODE_ENV === "production") throw data("Not found", { status: 404 });
  return null;
};

const SHOPS: SwitcherShop[] = [
  { id: "1", name: "Wunderwunsch", domain: "wunderwunsch.de", experiments: 6 },
  { id: "2", name: "Tierliebhaber", domain: "tierliebhaber.de", experiments: 2 },
  { id: "3", name: "BetterBeBold", domain: "betterbebold.com", experiments: 2 },
  { id: "4", name: "Ganz24", domain: "ganz24.de", experiments: 2 },
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-base font-semibold">{title}</h2>
      {note && <p className="mb-3 max-w-3xl text-xs text-base-content/50">{note}</p>}
      <div className="rounded-box border border-base-300 bg-base-200 p-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 last:mb-0">
      <span className="w-32 shrink-0 text-xs text-base-content/50">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function Styleguide() {
  const [tab, setTab] = useState("overview");
  const [mode, setMode] = useState<"daily" | "cumulative">("cumulative");
  const [shop, setShop] = useState<SwitcherShop | null>(SHOPS[0]);
  const [filter, setFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(["18.09.2026", "21.09.2026"]);
  const [checks, setChecks] = useState({ a: true, b: false });

  return (
    <>
      <PageHeader title="Styleguide">
        <span className="text-xs text-base-content/50">Figma: Foundations · dev only</span>
      </PageHeader>

      <Section title="Button" note="Figma 109:149 — 7 styles × 3 sizes × icon × trailing icon. ghost-outline, danger-soft and danger-text are new in WP5a.">
        {BUTTON_STYLES.map((s: ButtonStyle) => (
          <Row key={s} label={s}>
            {BUTTON_SIZES.map((size: ButtonSize) => (
              <Button key={size} styleName={s} size={size}>
                Button
              </Button>
            ))}
            <Button styleName={s} size="md" icon={<Plus size={buttonIconSize("md")} />}>
              Icon
            </Button>
            <Button styleName={s} size="md" trailingIcon={<Refresh size={buttonIconSize("md")} />}>
              Trailing
            </Button>
            <Button styleName={s} size="md" disabled>
              Disabled
            </Button>
          </Row>
        ))}
        <Row label="IconButton">
          <IconButton size="sm" label="Refresh" icon={<Refresh size={14} />} />
          <IconButton size="md" label="Refresh" icon={<Refresh size={16} />} />
        </Row>
      </Section>

      <Section title="Badge · VariantKey" note="Figma 109:64 / 115:1395. running = success + dot, paused = warning, draft = draft, ended = info.">
        <Row label="tones">
          {BADGE_TONES.map((t) => (
            <Badge key={t} tone={t}>
              {t}
            </Badge>
          ))}
        </Row>
        <Row label="with dot">
          {BADGE_TONES.map((t) => (
            <Badge key={t} tone={t} dot>
              {t}
            </Badge>
          ))}
        </Row>
        <Row label="VariantKey">
          <VariantKey letter="A" />
          <VariantKey letter="B" />
          <VariantKey letter="C" />
        </Row>
      </Section>

      <Section title="Tooltip" note="Figma 109:159 has only the trigger. The popover is designed here from the §2 tokens — to be confirmed by the designer. Hover, focus or click; Escape closes.">
        <Row label="trigger">
          <span className="text-sm">
            Conversions <Tooltip text="Converting visitors. A visitor with three orders converts once (contract 4.8)." />
          </span>
          <span className="text-sm">
            SRM <Tooltip side="bottom" text="Sample ratio mismatch: traffic did not split the way it was configured. Below p = 0,001 the result is not trustworthy." />
          </span>
        </Row>
      </Section>

      <Section title="Progress" note="Figma 109:165. The stopping-rule bar of ADR-0036, measured on the smaller arm. Neutral until the rule is met — colour is a verdict.">
        <Row label="neutral 45 %">
          <Progress value={0.45} label="Conversions in the smaller arm" className="w-40" />
        </Row>
        <Row label="success 100 %">
          <Progress value={1} tone="success" label="Conversions in the smaller arm" className="w-40" />
        </Row>
      </Section>

      <Section title="Chip · Pagination" note="Figma 109:173 / 109:174. Chips are the tainted-day editor in the Checks list (ADR-0037).">
        <Row label="chips">
          {days.map((d) => (
            <Chip key={d} removeLabel={`Remove ${d}`} onRemove={() => setDays((x) => x.filter((y) => y !== d))}>
              {d}
            </Chip>
          ))}
          <AddChip onClick={() => setDays((x) => [...x, `0${x.length + 1}.10.2026`])}>+ Add day</AddChip>
        </Row>
        <Row label="pagination">
          <Pagination page={page} pages={7} onPage={setPage} />
        </Row>
      </Section>

      <Section title="Dropdown · SearchInput" note="Figma 110:71 / 110:72. active = a filter is set, which on Results means explore mode (ADR-0034).">
        <Row label="dropdown">
          <DropdownTrigger icon={<Calendar size={14} />}>All time</DropdownTrigger>
          <DropdownTrigger icon={<Calendar size={14} />} active={filter} onClear={() => setFilter(false)} onClick={() => setFilter(true)}>
            Last 30 days
          </DropdownTrigger>
        </Row>
        <Row label="search">
          <SearchInput placeholder="Search" className="w-64" aria-label="Search" />
        </Row>
      </Section>

      <Section title="Tab · Segmented" note="Figma 110:84 / 110:116. Counters neutral grey, never coloured.">
        <Row label="underline tabs">
          <nav className="-mb-px flex items-end gap-1 border-b border-base-300">
            {[
              ["overview", "Overview", undefined],
              ["goals", "Goals", 3],
              ["devices", "Devices", undefined],
            ].map(([k, l, c]) => (
              <Tab key={k as string} active={tab === k} count={c as number | undefined} onClick={() => setTab(k as string)}>
                {l as string}
              </Tab>
            ))}
          </nav>
        </Row>
        <Row label="segmented md">
          <Segmented
            label="Chart mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "daily", label: "Daily" },
              { value: "cumulative", label: "Cumulative" },
            ]}
          />
        </Row>
        <Row label="segmented sm">
          <Segmented
            size="sm"
            label="Chart mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "daily", label: "Daily" },
              { value: "cumulative", label: "Cumulative" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Table" note="Figma 110:137 / 110:162. primary = the highlighted primary-metric column (ADR-0037); the lift is the sub line, neutral grey.">
        <TableFrame>
          <thead>
            <tr className="border-b border-base-300">
              <HeadCell>Variant</HeadCell>
              <HeadCell align="right">Visitors</HeadCell>
              <HeadCell align="right">Conversions</HeadCell>
              <HeadCell align="right" primary star sorted="desc">
                Conv. rate
              </HeadCell>
              <HeadCell align="right">Revenue</HeadCell>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-base-300/60">
              <Cell sub="Control">
                <span className="inline-flex items-center gap-2">
                  <VariantKey letter="A" /> Original
                </span>
              </Cell>
              <Cell align="right">24.180</Cell>
              <Cell align="right">712</Cell>
              <Cell align="right" kind="metric" primary>
                2,94 %
              </Cell>
              <Cell align="right">61.204,10 €</Cell>
            </tr>
            <tr>
              <Cell sub="Reviews above price">
                <span className="inline-flex items-center gap-2">
                  <VariantKey letter="B" /> Variant B
                </span>
              </Cell>
              <Cell align="right">24.052</Cell>
              <Cell align="right">794</Cell>
              <Cell align="right" kind="metric" primary sub="+11,6 % vs A">
                3,28 %
              </Cell>
              <Cell align="right">68.930,55 €</Cell>
            </tr>
          </tbody>
        </TableFrame>
      </Section>

      <Section title="ShopSwitcher" note="Figma 105:440 / 110:163. ADR-0038 made it the context of the Testing pages; the shop lives in the URL.">
        <div className="w-64">
          <ShopSwitcher shops={SHOPS} selected={shop} onSelect={setShop} onManage={() => undefined} />
        </div>
      </Section>

      <Section title="Form controls" note="Figma 8:94 / 8:102 / 8:123, confirmed by the designer on 01.10.: recessed surface (bg-base-100), 40 px / 32 px, and a set checkbox/radio on the control-checked token.">
        <Row label="checkbox">
          <Checkbox label="Mobile" checked={checks.a} onChange={(e) => setChecks((c) => ({ ...c, a: e.currentTarget.checked }))} />
          <Checkbox label="Desktop" checked={checks.b} onChange={(e) => setChecks((c) => ({ ...c, b: e.currentTarget.checked }))} />
          <Checkbox label="Disabled on" checked readOnly disabled />
          <Checkbox label="Disabled off" disabled />
        </Row>
        <Row label="radio">
          <Radio name="sg-radio" label="Immediate" defaultChecked />
          <Radio name="sg-radio" label="When visible" />
          <Radio name="sg-radio-d" label="Disabled on" checked readOnly disabled />
          <Radio name="sg-radio-d2" label="Disabled off" disabled />
        </Row>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Input label="Name" placeholder="e.g. PDP reviews above price" />
          <Input label="Key" mono defaultValue="pdp-reviews-above-price" locked hint="Locked while the experiment is running (contract 4.6)." />
          {/* Both of these said something a layperson cannot act on (DESIGN.md §10, designer 01.10.): a raw "1000"
              instead of a de-DE number, and an allocation expressed as the 0–1 fraction the model stores rather than
              the percentage the form asks for. */}
          <Input label="Conversions per variant" size="sm" defaultValue="1.000" />
          <Input label="Visitors in test" defaultValue="140" error="Visitors in test has to be between 1 and 100 %." />
        </div>
      </Section>

      <Section
        title="Select · Textarea"
        note="Added in WP5a-dashboard. Same box as Input; the menu is the browser's — Figma draws the trigger only, and a hand-rolled listbox would be a new accessible component for the sake of a popup nobody designed."
      >
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Select label="Primary – decides the test" defaultValue="CR">
            <option value="CR">Conversion rate</option>
            <option value="RPV">Revenue per visitor</option>
            <option value="AOV">Average order value</option>
          </Select>
          <Select label="Pages" size="sm" defaultValue="contains">
            <option value="contains">URL contains</option>
            <option value="exact">URL is exactly</option>
            <option value="regex">URL matches pattern</option>
          </Select>
          <Select label="Locked while running (4.6)" locked defaultValue="contains">
            <option value="contains">URL contains</option>
          </Select>
          <Select label="With an error" error="Pick a shop.">
            <option>Choose a shop</option>
          </Select>
          <Textarea label="Hypothesis" rows={3} placeholder="If we … then … because …" className="sm:col-span-2" />
        </div>
      </Section>

      <Section title="FormSection · UnsavedBar" note="DESIGN.md §7 Formulare. The unsaved bar is the only save button on an edit form — a second one in the header asks the same question twice.">
        <div className="max-w-2xl">
          <UnsavedBar onDiscard={() => undefined} />
          <FormSection title="Basics">
            <Input label="Name" placeholder="e.g. PDP: Reviews above price" />
          </FormSection>
        </div>
      </Section>

      <Section
        title="CodeField"
        note="CodeMirror 6 (ADR-0017), loaded after mount — it has no server rendering and is the heaviest thing on the form. Until it loads, and without JavaScript, the same value sits in the textarea underneath, which is also the field that gets submitted. Colours come from the §2 tokens, not from a packaged theme."
      >
        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <CodeField
            name="sg-js"
            label="JavaScript"
            language="javascript"
            defaultValue={"// Move the star rating above the price\nconst rating = document.querySelector('.product__rating');\nconst price  = document.querySelector('.product__price');\n\nif (rating && price) {\n  price.before(rating);\n  rating.classList.add('shab-rating-top');\n}"}
          />
          <CodeField name="sg-css" label="CSS" language="css" defaultValue={".shab-rating-top {\n  margin-bottom: 8px;\n  font-size: 15px;\n}"} />
        </div>
      </Section>

      <Section title="MobileTopBar" note="Figma 8:249, confirmed by the designer on 01.10.: wordmark left, menu right, no page title — the title sits in the page header right below.">
        <div className="max-w-sm overflow-hidden rounded-box border border-base-300">
          <MobileTopBar />
        </div>
      </Section>

      <Section title="Icons" note="36 icons, inline SVG, 24 viewBox, stroke currentColor (DESIGN.md §1). Path data picked from Lucide — no icon library as a dependency.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
          {(Object.keys(ICONS) as IconName[]).map((name) => {
            const Icon = ICONS[name];
            return (
              <div key={name} className="flex flex-col items-center gap-1.5 rounded-lg bg-base-100/40 p-3 text-center">
                <Icon size={18} className="text-base-content/80" />
                <span className="truncate text-[10px] text-base-content/50">{name}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
