/**
 * Alert — DESIGN.md §7 "Alerts".
 *
 * The classes are written out per tone instead of being built from a `kind` prop, for the same reason §7 gives for
 * `Button`: this file used to render `` `alert alert-${kind} alert-soft` ``, and a class name that only exists as an
 * interpolation is never seen by Tailwind's scanner, so `.alert-warning` was simply not in the stylesheet. Every
 * alert on every page came out colourless, which is a poor way to show the AOV warning that contract 4.8 requires.
 *
 * Tones use the semantic tokens of §2 at the opacities §4 prescribes (`bg-…/10`, `border-…/40`), so they match the
 * badges rather than inventing a second warning colour.
 */
import type { ReactNode } from "react";
import { Alert as AlertIcon, CheckCircle, Info } from "./icons";

export type AlertKind = "success" | "warning" | "error" | "info";
export const ALERT_KINDS: AlertKind[] = ["success", "warning", "error", "info"];

const BY_KIND: Record<AlertKind, string> = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  error: "border-error/40 bg-error/10 text-error",
  info: "border-info/40 bg-info/10 text-info",
};

const ICON: Record<AlertKind, (props: { size?: number; className?: string }) => ReactNode> = {
  success: CheckCircle,
  warning: AlertIcon,
  error: AlertIcon,
  info: Info,
};

export function Alert({ kind, children, className = "" }: { kind: AlertKind; children: ReactNode; className?: string }) {
  const Icon = ICON[kind];
  return (
    <div
      role="alert"
      className={["mb-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed", BY_KIND[kind], className].join(" ")}
    >
      <span className="mt-px shrink-0">
        <Icon size={16} />
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
