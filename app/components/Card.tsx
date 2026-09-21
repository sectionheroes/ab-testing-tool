import type { ReactNode } from "react";

// DESIGN.md §7 Card
export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={"flex flex-col rounded-box border border-base-300 bg-base-200 p-4 " + className}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <div className="text-[11px] uppercase tracking-wider text-base-content/50">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
