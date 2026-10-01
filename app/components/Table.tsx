/**
 * Table head and body cells — Figma `Table/HeadCell` (110:137) and `Table/Cell` (110:162).
 *
 * `primary` is the highlighted primary-metric column of ADR-0037: the metric is marked by **size and a faintly
 * filled column**, never by extra words. Figma tints the head at `base-300/50` and the body at `base-300/35`; that
 * difference is deliberate, not a rounding error, so it is kept.
 *
 * `kind="metric"` is the big 18px semibold number; `sub` is the line underneath it, which on the Results table
 * carries the lift ("+12,0 % vs A"). The sub line stays **neutral grey** — colour is a verdict and the verdict is
 * not out until the stopping rule is met (ADR-0037, DESIGN.md §10). There is deliberately no `tone` prop that could
 * turn it green; a caller that wants colour after the rule is met passes its own class.
 */
import type { ReactNode } from "react";

export function HeadCell({
  children,
  align = "left",
  primary = false,
  star = false,
  sorted,
  className = "",
  ...rest
}: {
  children: ReactNode;
  align?: "left" | "right";
  primary?: boolean;
  /** The ★ that marks the primary metric. */
  star?: boolean;
  sorted?: "asc" | "desc";
  className?: string;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
      className={[
        "whitespace-nowrap p-2.5 text-xs font-medium uppercase tracking-wider text-base-content/60",
        align === "right" ? "text-right" : "text-left",
        primary ? "bg-base-300/50" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      <span className={"inline-flex items-center gap-1.5 " + (align === "right" ? "flex-row-reverse" : "")}>
        {star && <span className="text-base-content/70">★</span>}
        {children}
        {sorted && <span className="text-[9px] text-base-content/40">{sorted === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

export function Cell({
  children,
  sub,
  kind = "text",
  align = "left",
  primary = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  sub?: ReactNode;
  kind?: "text" | "metric";
  align?: "left" | "right";
  primary?: boolean;
  className?: string;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={[
        "px-2.5 py-3.5 align-middle",
        align === "right" ? "text-right" : "text-left",
        primary ? "bg-base-300/35" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      <span className={kind === "metric" ? "block text-lg font-semibold tabular-nums text-base-content" : "block text-sm text-base-content/90"}>
        {children}
      </span>
      {sub !== undefined && sub !== null && (
        <span className={"mt-0.5 block text-base-content/60 " + (kind === "metric" ? "text-[11px]" : "text-xs")}>{sub}</span>
      )}
    </td>
  );
}

/**
 * The container every table sits in. The horizontal scroll lives **here**, not on the page: a Results table is wide
 * and the page itself must never scroll sideways (ADR-0037).
 */
export function TableFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={"overflow-x-auto rounded-box border border-base-300 bg-base-200 " + className}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}
