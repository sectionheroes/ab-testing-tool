/**
 * Sends `/dashboard`, `/dashboard/experiments` and `/dashboard/reconciliation` to the shop-scoped URL of ADR-0038.
 *
 * The remembered shop lives in `localStorage`, which the server cannot read, so the redirect happens after mount.
 * That is the **only** thing localStorage is allowed to decide (ADR-0038): which shop to reopen on landing. It is
 * never the source of truth — once the page is open, the URL is, which is what lets two tabs sit on two shops.
 *
 * Without JavaScript the link below still gets you to the global view, so the page is never a dead end.
 */
import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ALL_SHOPS, rememberedShop } from "./Shell";

export function RememberedShopRedirect({ section }: { section: "experiments" | "reconciliation" }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/dashboard/s/${rememberedShop()}/${section}`, { replace: true });
  }, [navigate, section]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-base-content/50">
        Opening your shop…{" "}
        <Link to={`/dashboard/s/${ALL_SHOPS}/${section}`} className="underline hover:text-base-content">
          all shops
        </Link>
      </p>
    </div>
  );
}
