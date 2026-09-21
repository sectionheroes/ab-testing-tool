import type { ReactNode } from "react";

// DESIGN.md §7 Alerts – only success | warning | error may use alert-soft.
export function Alert({ kind, children }: { kind: "success" | "warning" | "error"; children: ReactNode }) {
  return (
    <div role="alert" className={`alert alert-${kind} alert-soft mb-4 text-sm`}>
      {children}
    </div>
  );
}
