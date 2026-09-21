import type { ShopStatus } from "@prisma/client";

// DESIGN.md §7 Badges: success = active, warning = paused/pending, ghost = inactive/neutral
const CLASSES: Record<ShopStatus, string> = {
  ACTIVE: "badge-soft badge-success",
  PENDING: "badge-soft badge-warning",
  ALLOWLISTED: "badge-ghost",
  UNINSTALLED: "badge-ghost text-base-content/50",
};

export function StatusBadge({ status }: { status: ShopStatus }) {
  return <span className={`badge badge-sm ${CLASSES[status]}`}>{status.toLowerCase()}</span>;
}
