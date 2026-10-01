/**
 * Badge — Figma `Badge` (109:64). Status pill, six tones, optional dot.
 *
 * Figma fills each tone with the -500 of its colour family and sets the label to the -400 (`--color-success` etc.).
 * Here the fill is the existing token at 20 % instead of a second hex per tone: on the dark background the two are
 * about five values apart per channel, which is below what anyone can see, and DESIGN.md §9 is worth more than that.
 * The `info` tone is the one real change — `--color-info` was lilac and is sky from WP5a on (see §2).
 *
 * Mapping from the Figma description: running = success + dot · paused = warning · draft = draft · ended = info ·
 * errors = error · everything else = neutral.
 */
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info" | "draft";
export const BADGE_TONES: BadgeTone[] = ["neutral", "success", "warning", "error", "info", "draft"];

const BY_TONE: Record<BadgeTone, string> = {
  neutral: "bg-border-strong/30 text-base-content/80",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  error: "bg-error/20 text-error",
  info: "bg-info/20 text-info",
  draft: "border border-dashed border-base-content/40 text-base-content/60",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        BY_TONE[tone],
        className,
      ].join(" ")}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** VariantKey — Figma `VariantKey` (115:1395). The A/B/C box in front of a variant name. */
export function VariantKey({ letter, className = "" }: { letter: string; className?: string }) {
  return (
    <span
      className={[
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-base-300 font-mono text-[11px] font-medium text-base-content/80",
        className,
      ].join(" ")}
    >
      {letter}
    </span>
  );
}
