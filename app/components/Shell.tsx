import type { ReactNode } from "react";
import { Form, NavLink, useNavigation } from "react-router";
import ThemeToggle from "./ThemeToggle";
import { Badge } from "./Badge";
import { Flask, LogOut, Scales, Store, Users } from "./icons";

// DESIGN.md §6 Layout-Shell. Also rendered by the dashboard ErrorBoundary so navigation stays clickable.
//
// WP5a brought the lab look here: the active entry is the `nav-active*` recipe from §6 (emerald text on an emerald
// wash behind a 2px left line) instead of the flat `bg-base-content/10`, and every entry carries its Figma icon.
// The **grouping is deliberately unchanged**. Figma regroups it into Testing (Experiments, Reconciliation – they
// follow the ShopSwitcher) and Manage (Shops, Users), which is an information-architecture decision that STATUS.md
// still lists as needing an ADR. Restyling is this session's job; re-routing is not.

type NavItem = { to: string; label: string; badge?: string; icon?: ReactNode };
type NavGroup = { title: string; items: NavItem[] };

const INTERNAL_NAV: NavGroup[] = [
  {
    title: "Testing",
    items: [
      { to: "/dashboard/shops", label: "Shops", icon: <Store size={16} /> },
      { to: "/dashboard/experiments", label: "Experiments", icon: <Flask size={16} /> },
      { to: "/dashboard/reconciliation", label: "Reconciliation", icon: <Scales size={16} /> },
    ],
  },
  {
    title: "Admin",
    items: [{ to: "/dashboard/users", label: "Users", icon: <Users size={16} /> }],
  },
];

export function Shell({ user, nav = INTERNAL_NAV, children }: { user: { email: string }; nav?: NavGroup[]; children: ReactNode }) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="flex min-h-screen bg-base-100 font-sans text-base-content">
      {busy && <div className="app-progress" aria-hidden="true" />}

      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-base-300/50">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-base-300/50 px-5">
          <Wordmark />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {nav.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <div className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wider text-base-content/60">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  prefetch="intent"
                  className={({ isActive, isPending }) =>
                    // border-l-2 on every entry so the label does not jump by two pixels when one becomes active.
                    "mb-0.5 flex items-center justify-between gap-3 rounded-r-lg border-l-2 py-2.5 pl-3 pr-3 text-sm transition-colors " +
                    (isActive
                      ? "border-nav-active-line bg-nav-active-bg font-medium text-nav-active"
                      : isPending
                        ? "border-transparent bg-base-content/5 text-base-content"
                        : "border-transparent text-base-content/80 hover:bg-base-content/5 hover:text-base-content")
                  }
                >
                  {({ isPending }) => (
                    <>
                      <span className="flex min-w-0 items-center gap-3">
                        {item.icon && <span className="shrink-0">{item.icon}</span>}
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {item.badge && (
                          <Badge tone="neutral" className="uppercase tracking-wide">
                            {item.badge}
                          </Badge>
                        )}
                        {isPending && <span className="app-spinner" aria-hidden="true" />}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-base-300/50 p-3">
          <div className="truncate px-3 pb-2 font-mono text-xs text-base-content/60">{user.email}</div>
          <div className="flex items-center gap-1">
            <Form method="post" action="/logout" className="flex-1">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-r-lg py-2.5 pl-3 pr-3 text-sm font-medium text-base-content/80 transition-colors hover:bg-base-content/5 hover:text-base-content"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </Form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden px-10 py-8">{children}</main>
    </div>
  );
}

/** Text wordmark until the logo PNGs from DESIGN.md §4 are in the repo. Figma: outlined box + wordmark + "AB" badge. */
function Wordmark() {
  return (
    <>
      <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-base-content text-[11px] font-bold">
        sh
      </span>
      <span className="text-sm font-semibold tracking-tight">sectionheroes</span>
      <Badge tone="neutral">AB</Badge>
    </>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-base-content/60">{children}</p>}
    </div>
  );
}
