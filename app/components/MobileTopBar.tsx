/**
 * MobileTopBar — Figma `MobileTopBar` (8:249), **confirmed by the designer on 01.10.** (DESIGN.md §7).
 *
 * It is the small-screen counterpart of the sidebar: the wordmark on the left, the menu button that opens the nav on
 * the right, and **no page title** — that one sits right below in the page header, and repeating it here would say
 * the same thing twice in 56 px. Nothing routes through it yet; the mobile list is still on the design list
 * (STATUS.md).
 */
import type { ReactNode } from "react";
import { Menu } from "./icons";
import { Wordmark } from "./Shell";

export function MobileTopBar({
  onMenu,
  right,
  className = "",
}: {
  onMenu?: () => void;
  /** Anything that belongs left of the menu button, e.g. the theme toggle. */
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={
        "flex h-14 w-full items-center gap-2.5 border-b border-base-300 bg-base-100 px-4 " + className
      }
    >
      <Wordmark />
      <span className="flex-1" />
      {right}
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onMenu}
        className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-content/5 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40"
      >
        <Menu size={18} />
      </button>
    </header>
  );
}
