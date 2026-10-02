import { useEffect, useState, type ReactNode } from "react";
import { Form, NavLink, useLocation, useNavigate, useNavigation } from "react-router";
import ThemeToggle from "./ThemeToggle";
import { Badge } from "./Badge";
import { ShopSwitcher, type SwitcherShop } from "./ShopSwitcher";
import { Flask, LogOut, Scales, Store, Users } from "./icons";

// DESIGN.md §6 Layout-Shell. Also rendered by the dashboard ErrorBoundary so navigation stays clickable.
//
// **The grouping is ADR-0038.** The design-system session restyled the sidebar but deliberately left the old grouping
// alone, because regrouping it is an information-architecture decision and there was no ADR for one. ADR-0038 made it:
//
//   Testing  – Experiments, Reconciliation. These **follow the shop switcher** above them and their URLs carry the
//              shop (`/dashboard/s/:shop/…`, with `all` as a real value for the global view).
//   Manage   – Shops (ADMIN and MEMBER), Users (ADMIN only). Always global; they ignore the switcher, which is
//              exactly why they are not in the Testing group.
//
// The switcher writes the chosen shop to localStorage, but **only** so the landing route after login can reopen it.
// The URL stays the single source of truth, because two browser tabs on two shops is the agency's normal day and a
// hidden global would make them fight.

export const SHOP_STORAGE_KEY = "shab.shop";
export const ALL_SHOPS = "all";

export function rememberShop(value: string) {
  try {
    localStorage.setItem(SHOP_STORAGE_KEY, value);
  } catch {
    /* private mode, blocked storage – the URL still works, which is the point of the URL */
  }
}

export function rememberedShop(): string {
  try {
    return localStorage.getItem(SHOP_STORAGE_KEY) || ALL_SHOPS;
  } catch {
    return ALL_SHOPS;
  }
}

export type ShellUser = { email: string; role: "ADMIN" | "MEMBER" | "CLIENT" };

type NavItem = { to: string; label: string; badge?: string; icon?: ReactNode };
type NavGroup = { title: string; items: NavItem[] };

function navFor(user: ShellUser, shopParam: string): NavGroup[] {
  if (user.role === "CLIENT") return [];
  const manage: NavItem[] = [{ to: "/dashboard/shops", label: "Shops", icon: <Store size={16} /> }];
  if (user.role === "ADMIN") manage.push({ to: "/dashboard/users", label: "Users", icon: <Users size={16} /> });
  return [
    {
      title: "Testing",
      items: [
        { to: `/dashboard/s/${shopParam}/experiments`, label: "Experiments", icon: <Flask size={16} /> },
        { to: `/dashboard/s/${shopParam}/reconciliation`, label: "Reconciliation", icon: <Scales size={16} /> },
      ],
    },
    { title: "Manage", items: manage },
  ];
}

export function Shell({
  user,
  shops = [],
  shopParam = ALL_SHOPS,
  children,
}: {
  user: ShellUser;
  /** ACTIVE shops with their experiment counts – loaded in the same round as the page (ADR-0038). */
  shops?: SwitcherShop[];
  /** The `:shop` segment of the current URL: a myshopify domain, or `all`. */
  shopParam?: string;
  children: ReactNode;
}) {
  const busy = useNavigation().state !== "idle";
  const navigate = useNavigate();
  const location = useLocation();
  const internal = user.role !== "CLIENT";

  // The Manage pages carry no shop in their URL, because they are global (ADR-0038). The sidebar still has to point
  // its Testing links somewhere, so there it falls back to the remembered shop — which is the one case localStorage
  // is allowed to decide. Read after mount, so the server and the first client render agree.
  const onTestingRoute = location.pathname.startsWith("/dashboard/s/");
  const [fallback, setFallback] = useState(ALL_SHOPS);
  useEffect(() => {
    if (!onTestingRoute) setFallback(rememberedShop());
  }, [onTestingRoute]);
  const context = onTestingRoute ? shopParam : fallback;
  const selected = shops.find((s) => s.domain === context) ?? null;

  const switchTo = (shop: SwitcherShop | null) => {
    const next = shop ? shop.domain : ALL_SHOPS;
    rememberShop(next);
    // Stay on the same testing section; a shop switch is a change of context, not of subject.
    const section = typeof window !== "undefined" && window.location.pathname.includes("/reconciliation") ? "reconciliation" : "experiments";
    navigate(`/dashboard/s/${next}/${section}`);
  };

  return (
    <div className="flex min-h-screen bg-base-100 font-sans text-base-content">
      {busy && <div className="app-progress" aria-hidden="true" />}

      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-base-300/50">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-base-300/50 px-5">
          <Wordmark />
        </div>

        {internal && (
          <div className="shrink-0 px-3 pt-3">
            <ShopSwitcher shops={shops} selected={selected} onSelect={switchTo} onManage={() => navigate("/dashboard/shops")} />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navFor(user, context).map((group) => (
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
export function Wordmark() {
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
