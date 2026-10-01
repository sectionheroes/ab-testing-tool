/**
 * Shops — the *Manage* group of ADR-0038: always global, never following the shop switcher. That is exactly why it is
 * not in the Testing group; a page that ignores the context has no business sitting under it.
 *
 * A row click **sets the context** and jumps into that shop's experiments. The WP3 inspection page (orders, webhook
 * events, exposures, snippet errors) is still there, one explicit link away — it is a debugging tool, not the thing
 * you want on every click.
 *
 * Allowlisting a domain and activating a PENDING shop are **ADMIN-only**, and the check that matters is in
 * `shops.server.ts`, not here: hiding a button is a courtesy, the service layer is the guard, and the CLI goes
 * through the same functions (ADR-0038).
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";
import { requireInternal } from "../services/auth.server";
import { ShopError, activateShop, allowlistDomain, listShopsOverview } from "../services/shops.server";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Form";
import { rememberShop } from "../components/Shell";
import { Plus } from "../components/icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireInternal(request);
  const shops = await listShopsOverview();
  return {
    isAdmin: user.role === "ADMIN",
    shops: shops.map((s) => ({
      ...s,
      installedAt: s.installedAt?.toISOString() ?? null,
      reconciliation: s.reconciliation ? { date: s.reconciliation.date.toISOString(), status: s.reconciliation.status } : null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await requireInternal(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const actor = { email: user.email, role: user.role };
  try {
    if (intent === "allowlist") {
      const shop = await allowlistDomain(String(form.get("domain") ?? ""), actor);
      return { ok: `${shop.domain} added to the allowlist.` };
    }
    if (intent === "activate") {
      const shop = await activateShop(String(form.get("shopId") ?? ""), actor);
      return { ok: `${shop.domain} is now active.` };
    }
    return { error: "Unknown action." };
  } catch (err) {
    if (err instanceof ShopError) return { error: err.message };
    throw err;
  }
};

const STATUS_BADGE = {
  ACTIVE: { tone: "success" as const, dot: true, label: "active" },
  PENDING: { tone: "warning" as const, dot: false, label: "waiting for approval" },
  ALLOWLISTED: { tone: "draft" as const, dot: false, label: "allowlisted" },
  UNINSTALLED: { tone: "neutral" as const, dot: false, label: "uninstalled" },
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const int = new Intl.NumberFormat("de-DE");
const Dash = () => <span className="text-base-content/30">—</span>;

export default function ShopsPage() {
  const { shops, isAdmin } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigate = useNavigate();
  const submitting = useNavigation().state === "submitting";

  const open = (domain: string, status: string) => {
    if (status !== "ACTIVE") return; // only an active shop has a testing context to switch into
    rememberShop(domain);
    navigate(`/dashboard/s/${domain}/experiments`);
  };

  return (
    <>
      <PageHeader title="Shops" />
      {result?.ok && <Alert kind="success">{result.ok}</Alert>}
      {result?.error && <Alert kind="error">{result.error}</Alert>}

      {isAdmin && (
        <Card title="Allowlist a domain" className="mb-5 max-w-xl">
          <Form method="post" className="flex items-end gap-2">
            <Input name="domain" label="myshopify.com domain" placeholder="store.myshopify.com" required className="flex-1" />
            <Button type="submit" name="intent" value="allowlist" styleName="primary" size="md" icon={<Plus size={16} />} disabled={submitting}>
              Add
            </Button>
          </Form>
          <p className="mt-2 text-xs text-base-content/50">An allowlisted shop becomes active by itself when it installs the app.</p>
        </Card>
      )}

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Shop</th>
              <th>Status</th>
              <th className="text-right">Running tests</th>
              <th className="whitespace-nowrap">Last reconciliation</th>
              <th className="text-right"></th>
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr>
                <td colSpan={5} className="py-9 text-center text-base-content/60">
                  No shops yet.
                </td>
              </tr>
            )}
            {shops.map((shop) => (
              <tr
                key={shop.id}
                className={"transition-colors hover:bg-base-content/[0.03] " + (shop.status === "ACTIVE" ? "cursor-pointer" : "")}
                onClick={() => open(shop.domain, shop.status)}
              >
                <td className="align-top">
                  <span className="block truncate font-medium">{shop.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-base-content/60">{shop.domain}</span>
                </td>
                <td className="align-top">
                  <Badge tone={STATUS_BADGE[shop.status].tone} dot={STATUS_BADGE[shop.status].dot}>
                    {STATUS_BADGE[shop.status].label}
                  </Badge>
                </td>
                <td className="text-right align-top tabular-nums">
                  {shop.running > 0 ? int.format(shop.running) : <Dash />}
                  {shop.experiments > 0 && <span className="mt-0.5 block text-xs text-base-content/60">{int.format(shop.experiments)} in total</span>}
                </td>
                <td className="align-top">
                  {shop.reconciliation ? (
                    <>
                      <span className="block whitespace-nowrap tabular-nums">{dateFmt.format(new Date(shop.reconciliation.date))}</span>
                      <span className={"mt-0.5 block text-xs " + (shop.reconciliation.status === "OK" ? "text-base-content/60" : "text-error")}>
                        {shop.reconciliation.status === "OK" ? "matches" : "mismatch"}
                      </span>
                    </>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="whitespace-nowrap text-right align-top" onClick={(e) => e.stopPropagation()}>
                  {shop.status === "PENDING" && isAdmin && (
                    <Form method="post" className="inline-block">
                      <input type="hidden" name="shopId" value={shop.id} />
                      <Button type="submit" name="intent" value="activate" styleName="primary" size="sm" disabled={submitting}>
                        Approve
                      </Button>
                    </Form>
                  )}
                  <Link to={`/dashboard/shops/${shop.id}`} className="ml-3 text-xs text-base-content/60 transition-colors hover:text-base-content hover:underline">
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
