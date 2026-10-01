/**
 * Button — Figma `Button` (109:149), seven styles × three sizes × icon × trailingIcon.
 *
 * DESIGN.md §7 "Buttons" grew from five styles to seven in WP5a: `ghost-outline`, `danger-soft` and `danger-text`
 * are new. The classes are written out rather than built from daisyUI's `btn-*`, because four of the seven have no
 * daisyUI equivalent and a half-daisyUI/half-custom set would be the worst of both — the one thing every recipe in
 * §7 relies on is that the same look comes from the same class list everywhere.
 *
 * Only semantic tokens (DESIGN.md §9): no `slate-*`, no hex. `danger` is the one place that needs its own token —
 * daisyUI's `btn-error` is the light red (`--color-error`) with dark text, Figma's solid danger is the saturated red
 * with white text, which is `danger-solid` in §2.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonStyle = "primary" | "secondary" | "ghost" | "ghost-outline" | "danger" | "danger-soft" | "danger-text";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_STYLES: ButtonStyle[] = ["primary", "secondary", "ghost", "ghost-outline", "danger", "danger-soft", "danger-text"];
export const BUTTON_SIZES: ButtonSize[] = ["sm", "md", "lg"];

const BY_STYLE: Record<ButtonStyle, string> = {
  primary: "bg-primary text-primary-content hover:bg-primary/90",
  secondary: "border border-border-strong bg-base-200/50 text-base-content/90 hover:bg-base-300/60",
  ghost: "text-base-content/80 hover:bg-base-content/5 hover:text-base-content",
  "ghost-outline": "border border-base-400 text-base-content/80 hover:bg-base-content/5 hover:text-base-content",
  danger: "bg-danger-solid text-danger-solid-content hover:bg-danger-solid/90",
  "danger-soft": "border border-error/50 bg-danger-solid/10 text-error hover:bg-danger-solid/20",
  "danger-text": "text-error hover:bg-danger-solid/10",
};

const BY_SIZE: Record<ButtonSize, string> = {
  sm: "gap-1.5 px-3 py-[7px] text-[13px]",
  md: "gap-2 px-4 py-[9px] text-sm",
  lg: "gap-2 px-4 py-[11px] text-[15px]",
};

/** Figma uses a 14px glyph on `sm` and 16px from `md` up. */
export const buttonIconSize = (size: ButtonSize) => (size === "sm" ? 14 : 16);

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
  styleName?: ButtonStyle;
  size?: ButtonSize;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { styleName = "primary", size = "sm", icon, trailingIcon, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
        BY_SIZE[size],
        BY_STYLE[styleName],
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
});

/**
 * IconButton — Figma `IconButton` (109:158). Square, outlined in `base-400`, 28px (sm) or 32px (md).
 * `label` is required: an icon-only control with no accessible name is unusable with a screen reader.
 */
export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style" | "children"> & {
  size?: "sm" | "md";
  icon: ReactNode;
  label: string;
  className?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "sm", icon, label, className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-base-400 text-base-content/70 transition-colors",
        "hover:bg-base-content/5 hover:text-base-content",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40",
        size === "md" ? "size-8" : "size-7",
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
    </button>
  );
});
