/**
 * The small controls of the lab set, one component per Figma component:
 * `Chip` (109:173) · `Pagination` (109:174) · `Dropdown` (110:71) · `SearchInput` (110:72) ·
 * `Tab` (110:84) · `Segmented/Item` + `Segmented` (110:93 / 110:116).
 *
 * All of them only use §2 tokens. Where Figma writes a slate value that is a plain opacity step on `base-content`
 * (#e2e8f0 ≈ /90, #cbd5e1 ≈ /80, #94a3b8 ≈ /60, #64748b ≈ /40) the token wins — DESIGN.md §4 prescribes exactly those
 * classes, so following the hex would mean breaking the spec that the hex was drawn from.
 */
import type { ReactNode } from "react";
import { ChevronDown, Search as SearchIcon, X } from "./icons";

/* ── Chip (109:173) ──────────────────────────────────────────────────────── */

/** `kind="value"` is a set value with an ✕; `kind="add"` is the dashed-looking "+ Add …" affordance. */
export function Chip({
  children,
  onRemove,
  removeLabel,
  className = "",
}: {
  children: ReactNode;
  onRemove?: () => void;
  /** Accessible name for the ✕, e.g. "Remove 18.09.2026". */
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md bg-base-300 py-0.5 pl-2 pr-1.5 text-xs text-base-content/90 " + className
      }
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="text-base-content/50 transition-colors hover:text-error focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-base-content/40"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

export function AddChip({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={
        "inline-flex items-center rounded-md border border-border-strong px-2 py-0.5 text-xs text-base-content/80 transition-colors hover:border-base-content/50 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40 " +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Pagination (109:174) ────────────────────────────────────────────────── */

export function Pagination({
  page,
  pages,
  onPage,
  className = "",
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const step = "px-3 py-1.5 text-[13px] transition-colors disabled:text-base-content/25 enabled:text-base-content/60 enabled:hover:bg-base-content/5 enabled:hover:text-base-content";
  return (
    <div className={"inline-flex items-center overflow-hidden rounded-lg border border-base-400 " + className}>
      <button type="button" className={step} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        «
      </button>
      <span className="border-x border-base-400 px-3 py-1.5 text-[13px] tabular-nums text-base-content/60" aria-live="polite">
        Page {page} / {pages}
      </span>
      <button type="button" className={step} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
        »
      </button>
    </div>
  );
}

/* ── Dropdown trigger (110:71) ───────────────────────────────────────────── */

/**
 * The filter trigger. `active` means a filter is set — on the Results page that is explore mode (ADR-0034), and the
 * ✕ clears it. Only the trigger lives here; the panel it opens is the Dropdown recipe in DESIGN.md §7.
 */
export function DropdownTrigger({
  children,
  icon,
  active = false,
  onClear,
  clearLabel = "Clear filter",
  className = "",
  ...rest
}: {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-lg border px-3 py-[7px] text-[13px] font-medium transition-colors",
        active ? "border-base-content/60 bg-base-400/50 text-base-content" : "border-border-strong bg-base-200/50 text-base-content/90 hover:bg-base-300/60",
        className,
      ].join(" ")}
    >
      <button type="button" className="inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40" {...rest}>
        {icon && <span className="text-base-content/60">{icon}</span>}
        {children}
        {!active && <ChevronDown size={14} className="text-base-content/60" />}
      </button>
      {active && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="text-base-content/60 transition-colors hover:text-base-content focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-base-content/40"
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}

/* ── SearchInput (110:72) ────────────────────────────────────────────────── */

export function SearchInput({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <div className={"relative " + className}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">
        <SearchIcon size={15} />
      </span>
      <input
        type="search"
        className="w-full rounded-lg bg-base-300/60 py-2 pl-9 pr-3 text-[13px] text-base-content outline-none transition-colors placeholder:text-base-content/40 hover:bg-base-300 focus:bg-base-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40"
        {...rest}
      />
    </div>
  );
}

/* ── Underline tab (110:84) ──────────────────────────────────────────────── */

/**
 * Sits in a row whose bottom border the active line lies on — give the row `-mb-px` over a `border-b`.
 * The counter is neutral grey, never coloured (DESIGN.md §7, ADR-0037).
 */
export function Tab({
  children,
  active = false,
  count,
  as: As = "button",
  className = "",
  ...rest
}: {
  children: ReactNode;
  active?: boolean;
  count?: number | string;
  as?: React.ElementType;
  className?: string;
} & Record<string, unknown>) {
  return (
    <As
      className={[
        "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 pb-3 pt-1.5 text-sm transition-colors",
        active ? "border-base-content/90 font-medium text-base-content" : "border-transparent text-base-content/60 hover:text-base-content",
        className,
      ].join(" ")}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-base-content/12 px-2 py-px text-xs font-medium text-base-content/80 tabular-nums">{count}</span>
      )}
    </As>
  );
}

/* ── Segmented (110:93 / 110:116) ────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Accessible name of the group, e.g. "Chart mode". */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={"inline-flex items-center gap-0.5 rounded-lg bg-base-300/60 p-[3px] " + className}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={[
              "rounded-md px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
              size === "sm" ? "py-1 text-xs" : "py-[5px] text-[13px]",
              active ? "bg-base-400 font-medium text-base-content" : "text-base-content/60 hover:text-base-content",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
