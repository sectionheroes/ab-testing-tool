/**
 * ShopSwitcher — Figma `ShopSwitcher` (105:440) and `ShopSwitcher/Menu` (110:163).
 *
 * **Presentation only.** The switcher *context* — which pages follow it, whether the shop goes in the URL — is an
 * open decision in STATUS.md and needs an ADR before anything routes through it. This component takes a list and a
 * callback and does nothing else; wiring it into the shell is WP5a proper, not this session.
 *
 * The favicon colour is derived from the domain, not stored: Figma shows one brand colour per shop, and inventing a
 * `Shop.color` column for a decoration would be the wrong kind of permanent. The palette is fixed so a shop keeps
 * its colour between sessions.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown } from "./icons";
import { SearchInput } from "./Controls";

export type SwitcherShop = { id: string; name: string; domain: string; experiments?: number };

/** Chart-style literals are the documented exception to "no hex" (DESIGN.md §9); these are data, not theme. */
const FAVICON_COLORS = ["#e11d48", "#0891b2", "#7c3aed", "#ea580c", "#16a34a", "#ca8a04", "#2563eb", "#db2777"];

export function faviconColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FAVICON_COLORS[h % FAVICON_COLORS.length];
}

function Favicon({ name, domain, size = 22 }: { name: string; domain?: string; size?: number }) {
  const all = domain === undefined;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
      style={{
        width: size,
        height: size,
        background: all ? "var(--color-base-300)" : faviconColor(domain || name),
        color: all ? "var(--color-base-content)" : "#ffffff",
        opacity: all ? 0.6 : 1,
      }}
    >
      {all ? "∗" : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ShopSwitcher({
  shops,
  selected,
  onSelect,
  onManage,
  className = "",
}: {
  /** Only ACTIVE shops belong in here (Figma note). */
  shops: SwitcherShop[];
  /** null = "All shops". */
  selected: SwitcherShop | null;
  onSelect: (shop: SwitcherShop | null) => void;
  onManage?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = q ? shops.filter((s) => s.name.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q)) : shops;
  const total = shops.reduce((sum, s) => sum + (s.experiments ?? 0), 0);

  const item = (active: boolean) =>
    "flex w-full items-center gap-2.5 rounded-md py-[7px] pl-2 pr-2.5 text-left text-[13px] transition-colors " +
    (active ? "bg-base-400/60 font-medium text-base-content" : "text-base-content/80 hover:bg-base-content/5");

  return (
    <div ref={wrap} className={"relative " + className}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-base-400 bg-base-200/50 px-2.5 py-2 text-left transition-colors hover:bg-base-300/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/40"
      >
        <Favicon name={selected?.name ?? "All shops"} domain={selected?.domain} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-base-content">{selected?.name ?? "All shops"}</span>
          <span className="block truncate text-xs text-base-content/60">{selected?.domain ?? `${shops.length} shops`}</span>
        </span>
        <ChevronsUpDown size={16} className="shrink-0 text-base-content/60" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 flex flex-col gap-0.5 rounded-box border border-base-400 bg-base-200 p-1.5 shadow-lg"
        >
          <SearchInput placeholder="Find shop…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label="Find shop" />

          <button type="button" role="menuitem" className={item(selected === null)} onClick={() => (onSelect(null), setOpen(false))}>
            <Favicon name="All shops" />
            <span className="min-w-0 flex-1 truncate">All shops</span>
            <span className="text-xs tabular-nums text-base-content/40">{total}</span>
          </button>

          <span className="my-0.5 h-px w-full bg-base-300" />

          {visible.map((s) => (
            <button key={s.id} type="button" role="menuitem" className={item(selected?.id === s.id)} onClick={() => (onSelect(s), setOpen(false))}>
              <Favicon name={s.name} domain={s.domain} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.experiments !== undefined && <span className="text-xs tabular-nums text-base-content/40">{s.experiments}</span>}
            </button>
          ))}
          {visible.length === 0 && <span className="px-2 py-3 text-center text-xs text-base-content/50">No shop matches.</span>}

          {onManage && (
            <>
              <span className="my-0.5 h-px w-full bg-base-300" />
              <button
                type="button"
                role="menuitem"
                onClick={() => (onManage(), setOpen(false))}
                className="rounded-md px-2.5 py-2 text-left text-[13px] text-base-content/60 transition-colors hover:bg-base-content/5 hover:text-base-content"
              >
                Manage shops →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
