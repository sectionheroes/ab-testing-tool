/**
 * MobileTopBar — Figma `MobileTopBar` (8:249), also flagged OUTDATED in STATUS.md and therefore built from the
 * current token set rather than transcribed. Listed in STATUS.md as to be confirmed by the designer.
 *
 * It is the small-screen counterpart of the sidebar: logo, page title, and the menu button that opens the nav.
 * Nothing routes through it yet — the mobile list is still on the design list (STATUS.md).
 */
import type { ReactNode } from "react";
import { Menu } from "./icons";

export function MobileTopBar({
  title,
  onMenu,
  right,
  className = "",
}: {
  title: ReactNode;
  onMenu?: () => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={
        "flex h-14 w-full items-center gap-3 border-b border-base-300/50 bg-base-100 px-4 " + className
      }
    >
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onMenu}
        className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-content/5 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40"
      >
        <Menu size={18} />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-content">{title}</span>
      {right}
    </header>
  );
}
