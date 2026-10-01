/**
 * Progress — Figma `Progress` (109:165). The stopping-rule bar of ADR-0036, measured on the **smaller arm**.
 *
 * `tone="neutral"` is not decoration: a lift stays neutral grey until the stopping rule is met, because colour is a
 * verdict (ADR-0037, DESIGN.md §10). The caller passes `success` only once the rule is actually met.
 *
 * The fill is `success-solid` (emerald-500), not `success` (emerald-400) — at full opacity the two are far enough
 * apart to see, which is why §2 carries the extra token.
 */
export function Progress({
  value,
  tone = "neutral",
  label,
  className = "",
}: {
  /** 0–1. Anything outside is clamped rather than overflowing the track. */
  value: number;
  tone?: "success" | "neutral";
  /** Accessible name, e.g. "Conversions in the smaller arm". */
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      // No `w-*` of our own: a width utility in here would collide with the caller's and Tailwind resolves that by
      // source order, not by the order in this string – which is how the bar ended up 0 px wide the first time.
      // As a block element it fills its parent; inside a flex row the caller gives it a width.
      className={"block h-1.5 overflow-hidden rounded-full bg-base-300 " + className}
    >
      <span
        className={"block h-full rounded-full transition-[width] " + (tone === "success" ? "bg-success-solid" : "bg-border-strong")}
        style={{ width: `${pct * 100}%` }}
      />
    </span>
  );
}
