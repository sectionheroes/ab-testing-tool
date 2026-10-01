/**
 * Form controls — Figma `Checkbox` (8:94), `Radio` (8:102) and `Input` (8:123).
 *
 * **These four are flagged OUTDATED in STATUS.md** (they predate the lab-dark set), so they are deliberately *not*
 * transcribed from Figma. They are built from the current §2 token set so they sit next to the lab components
 * without clashing, and they are listed in STATUS.md as to be confirmed by the designer. The variants are the ones
 * Figma names: Checkbox/Radio on · off · disabled-on · disabled-off, Input md/sm × default · locked · error.
 *
 * `locked` is the contract-4.6 state: targeting, allocation, weights and salt cannot be edited while an experiment
 * is RUNNING. It is a *rendered* state here — the actual guard lives in the service layer, not in a CSS class.
 */
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Lock } from "./icons";

export type FieldSize = "sm" | "md";

/* ── Checkbox ────────────────────────────────────────────────────────────── */

export function Checkbox({
  label,
  className = "",
  disabled,
  ...rest
}: { label: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  return (
    <label className={["inline-flex items-center gap-2 text-sm", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className].join(" ")}>
      <span className="relative inline-flex size-4 shrink-0">
        <input type="checkbox" disabled={disabled} className="peer size-4 appearance-none rounded border border-border-strong bg-base-200 transition-colors checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40" {...rest} />
        <Check size={12} className="pointer-events-none absolute left-0.5 top-0.5 hidden text-primary-content peer-checked:block" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/* ── Radio ───────────────────────────────────────────────────────────────── */

export function Radio({
  label,
  className = "",
  disabled,
  ...rest
}: { label: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  return (
    <label className={["inline-flex items-center gap-2 text-sm", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", className].join(" ")}>
      <span className="relative inline-flex size-4 shrink-0">
        <input type="radio" disabled={disabled} className="peer size-4 appearance-none rounded-full border border-border-strong bg-base-200 transition-colors checked:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40" {...rest} />
        <span className="pointer-events-none absolute left-1 top-1 hidden size-2 rounded-full bg-primary peer-checked:block" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/* ── Input ───────────────────────────────────────────────────────────────── */

export function Input({
  label,
  hint,
  error,
  locked = false,
  size = "md",
  mono = false,
  className = "",
  ...rest
}: {
  label?: ReactNode;
  hint?: ReactNode;
  /** Message under the field. Its presence is what puts the field in the error state. */
  error?: ReactNode;
  /** Contract 4.6: locked while RUNNING. Renders as disabled with a padlock and an explanation. */
  locked?: boolean;
  size?: FieldSize;
  mono?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "size">) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className={"block " + className} htmlFor={id}>
      {label && <span className="mb-1.5 block text-sm text-base-content/60">{label}</span>}
      <span className="relative block">
        <input
          id={id}
          disabled={locked || rest.disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            "w-full rounded-lg border bg-base-200 text-base-content outline-none transition-colors",
            "placeholder:text-base-content/40",
            "focus:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
            "disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50",
            size === "sm" ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-sm",
            locked ? "pr-8" : "",
            mono ? "font-mono" : "",
            error ? "border-error" : "border-border-strong",
          ].join(" ")}
          {...rest}
        />
        {locked && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40">
            <Lock size={14} />
          </span>
        )}
      </span>
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-xs text-error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-1.5 block text-xs text-base-content/50">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
