/**
 * Tooltip — Figma `TooltipTrigger` (109:159) plus the popover, which Figma does **not** have.
 *
 * This replaces the `title`-attribute recipe DESIGN.md §7 used to carry. That one could not be styled, appeared after
 * a browser-controlled delay, and on touch never appeared at all — and the Results page needs about ten of these
 * (DESIGN.md §10, ADR-0037), so it was a blocker rather than a nicety.
 *
 * The popover is **designed here, not taken from Figma**: only the trigger exists in the file. It is built from the
 * §2 tokens (`base-300` surface, `base-400` border, `shadow-lg` per §5) and is listed in STATUS.md as to be confirmed
 * by the designer.
 *
 * Behaviour, in the order it matters:
 *  - opens on hover **and** on focus **and** on click, so mouse, keyboard and touch all reach it;
 *  - Escape closes it and returns focus to the trigger;
 *  - a click outside closes it (DESIGN.md §8);
 *  - `aria-describedby` ties the text to the trigger, so a screen reader reads it instead of skipping a bare "?".
 *
 * The text belongs to the glossary module (plan WP5a), never inline in JSX — one definition per term, so the same
 * term cannot drift between pages.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Tooltip({
  text,
  label = "Explain",
  className = "",
  side = "top",
}: {
  text: ReactNode;
  /** Accessible name of the trigger; the visible glyph is always "?". */
  label?: string;
  className?: string;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setPinned(false);
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrap} className={"relative inline-flex align-middle " + className}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full bg-base-content/10 text-[10px] font-semibold text-base-content/60 transition-colors hover:bg-base-content/20 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned((p) => !p);
          setOpen((o) => !o || !pinned);
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={[
            "absolute left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg border border-base-400 bg-base-300 px-3 py-2",
            "text-left text-xs font-normal leading-relaxed text-base-content/90 shadow-lg",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          {text}
        </span>
      )}
    </span>
  );
}
