import type { ReactNode } from "react";
import { Form, NavLink, useNavigation } from "react-router";
import ThemeToggle from "./ThemeToggle";

// DESIGN.md §6 Layout-Shell. Also rendered by the dashboard ErrorBoundary so navigation stays clickable.

type NavItem = { to: string; label: string; badge?: string };
type NavGroup = { title: string; items: NavItem[] };

const INTERNAL_NAV: NavGroup[] = [
  {
    title: "Testing",
    items: [
      { to: "/dashboard/shops", label: "Shops" },
      { to: "/dashboard/experiments", label: "Experiments" },
      { to: "/dashboard/reconciliation", label: "Reconciliation" },
    ],
  },
  {
    title: "Admin",
    items: [{ to: "/dashboard/users", label: "Users" }],
  },
];

export function Shell({ user, nav = INTERNAL_NAV, children }: { user: { email: string }; nav?: NavGroup[]; children: ReactNode }) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="flex min-h-screen bg-base-100 font-sans text-base-content">
      {busy && <div className="app-progress" aria-hidden="true" />}

      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-base-300 px-4 py-5">
        <div className="px-2 pb-5">
          <Wordmark />
        </div>

        <nav className="flex-1 overflow-y-auto">
          {nav.map((group) => (
            <div key={group.title} className="mb-4">
              <div className="px-2 pb-1.5 text-[11px] uppercase tracking-wider text-base-content/60">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  prefetch="intent"
                  className={({ isActive, isPending }) =>
                    "mb-0.5 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors " +
                    (isActive ? "bg-base-content/10 text-base-content" : isPending ? "bg-base-content/5 text-base-content" : "hover:bg-base-content/5")
                  }
                >
                  {({ isPending }) => (
                    <>
                      <span>{item.label}</span>
                      <span className="flex items-center gap-1.5">
                        {item.badge && <span className="badge badge-ghost badge-xs uppercase tracking-wide">{item.badge}</span>}
                        {isPending && <span className="app-spinner" aria-hidden="true" />}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-base-300 pt-3">
          <div className="truncate px-0.5 pb-2 text-xs text-base-content/60">{user.email}</div>
          <div className="flex items-center gap-2">
            <Form method="post" action="/logout" className="flex-1">
              <button type="submit" className="btn btn-ghost btn-sm w-full border-base-300 font-medium text-base-content/60 hover:text-base-content">
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

/** Text wordmark until the logo PNGs from DESIGN.md §4 are in the repo. */
function Wordmark() {
  return (
    <div className="flex h-6 items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-content">sh</span>
      <span className="text-sm font-semibold tracking-tight">sectionheroes</span>
      <span className="badge badge-ghost badge-xs uppercase tracking-wide">ab</span>
    </div>
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
