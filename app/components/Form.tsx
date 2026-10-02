/**
 * Form controls — Figma `Checkbox` (8:94), `Radio` (8:102) and `Input` (8:123).
 *
 * **Confirmed by the designer on 01.10.** (DESIGN.md §7 "Formularfelder"), with three corrections applied: the
 * field surface is `bg-base-100` rather than `bg-base-200` — on a `base-200` card a `base-200` field disappears
 * except for its border — the `md` height is 40 px and `sm` 32 px, and a *set* checkbox/radio uses the `control-checked`
 * token instead of `primary`, because in light mode Mint on white barely reads as "on". The variants are the ones
 * Figma names: Checkbox/Radio on · off · disabled-on · disabled-off, Input md/sm × default · locked · error.
 *
 * `locked` is the contract-4.6 state: targeting, allocation, weights and salt cannot be edited while an experiment
 * is RUNNING. It is a *rendered* state here — the actual guard lives in the service layer, not in a CSS class.
 */
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Button } from "./Button";
import { Check, ChevronDown, Lock } from "./icons";

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
        <input type="checkbox" disabled={disabled} className="peer size-4 appearance-none rounded border border-border-strong bg-base-100 transition-colors checked:border-control-checked checked:bg-control-checked focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40" {...rest} />
        <Check size={12} className="pointer-events-none absolute left-0.5 top-0.5 hidden text-control-checked-content peer-checked:block" />
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
        <input type="radio" disabled={disabled} className="peer size-4 appearance-none rounded-full border border-border-strong bg-base-100 transition-colors checked:border-control-checked focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40" {...rest} />
        <span className="pointer-events-none absolute left-1 top-1 hidden size-2 rounded-full bg-control-checked peer-checked:block" />
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
            "w-full rounded-lg border bg-base-100 text-base-content outline-none transition-colors",
            "placeholder:text-base-content/40",
            "focus:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
            "disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50",
            size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-3 text-sm",
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

/* ── Select ──────────────────────────────────────────────────────────────── */

/**
 * The same box as `Input`, with the native menu behind it. Figma draws the trigger (Basics "Primary", "Where it
 * runs" → Pages) but has no open menu, so the popup is the browser's: a hand-rolled listbox would be a new
 * interactive component to keep accessible for the sake of matching a popup nobody drew.
 */
export function Select({
  label,
  hint,
  error,
  locked = false,
  size = "md",
  className = "",
  children,
  ...rest
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  locked?: boolean;
  size?: FieldSize;
  className?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className={"block " + className} htmlFor={id}>
      {label && <span className="mb-1.5 block text-sm text-base-content/60">{label}</span>}
      <span className="relative block">
        <select
          id={id}
          disabled={locked || rest.disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            "w-full appearance-none rounded-lg border bg-base-100 pr-9 text-base-content outline-none transition-colors",
            "focus:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
            "disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50",
            size === "sm" ? "h-8 pl-2.5 text-[13px]" : "h-10 pl-3 text-sm",
            error ? "border-error" : "border-border-strong",
          ].join(" ")}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/50">
          {locked ? <Lock size={14} /> : <ChevronDown size={14} />}
        </span>
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

/* ── Textarea ────────────────────────────────────────────────────────────── */

export function Textarea({
  label,
  hint,
  error,
  locked = false,
  className = "",
  ...rest
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  locked?: boolean;
  className?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className={"block " + className} htmlFor={id}>
      {label && <span className="mb-1.5 block text-sm text-base-content/60">{label}</span>}
      <textarea
        id={id}
        disabled={locked || rest.disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "w-full rounded-lg border bg-base-100 px-3 py-2 text-sm leading-relaxed text-base-content outline-none transition-colors",
          "placeholder:text-base-content/40",
          "focus:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
          "disabled:cursor-not-allowed disabled:bg-base-300/40 disabled:text-base-content/50",
          error ? "border-error" : "border-border-strong",
        ].join(" ")}
        {...rest}
      />
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

/* ── Form section ────────────────────────────────────────────────────────── */

/** DESIGN.md §7 "Formulare": a card with a 16px semibold heading. The experiment form is three of these. */
export function FormSection({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"rounded-box border border-base-300 bg-base-200 p-5 " + className}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Unsaved-changes bar ─────────────────────────────────────────────────── */

/**
 * DESIGN.md §7: sticky, appears the moment something changes, carries Discard and Save. It is the *only* save button
 * on an edit form — a second one in the header would ask the same question twice.
 */
export function UnsavedBar({
  message = "Unsaved changes",
  saving = false,
  onDiscard,
  className = "",
}: {
  message?: ReactNode;
  saving?: boolean;
  onDiscard?: () => void;
  className?: string;
}) {
  return (
    <div
      className={
        "sticky top-3 z-20 mb-4 flex items-center justify-between gap-3 rounded-box border border-base-300 bg-neutral px-3.5 py-2.5 text-sm font-medium text-neutral-content shadow-lg " +
        className
      }
    >
      <span>{message}</span>
      <div className="flex gap-2">
        {onDiscard && (
          <Button type="button" styleName="ghost-outline" size="sm" onClick={onDiscard} className="text-neutral-content/80">
            Discard
          </Button>
        )}
        <Button type="submit" styleName="primary" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
