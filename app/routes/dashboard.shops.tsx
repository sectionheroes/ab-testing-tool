import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireInternal } from "../services/auth.server";
import { ShopError, activateShop, allowlistDomain, listShops } from "../services/shops.server";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Alert } from "../components/Alert";
import { StatusBadge } from "../components/StatusBadge";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireInternal(request);
  const shops = await listShops();
  return {
    shops: shops.map((s) => ({ id: s.id, domain: s.domain, name: s.name, status: s.status, installedAt: s.installedAt?.toISOString() ?? null })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await requireInternal(request);
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "allowlist") {
      const shop = await allowlistDomain(String(form.get("domain") ?? ""), user.email);
      return { ok: `${shop.domain} added to the allowlist.` };
    }
    if (intent === "activate") {
      const shop = await activateShop(String(form.get("shopId") ?? ""), user.email);
      return { ok: `${shop.domain} is now active.` };
    }
    return { error: "Unknown action." };
  } catch (err) {
    if (err instanceof ShopError) return { error: err.message };
    throw err;
  }
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default function ShopsPage() {
  const { shops } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <>
      <PageHeader title="Shops" />
      {result?.ok && <Alert kind="success">{result.ok}</Alert>}
      {result?.error && <Alert kind="error">{result.error}</Alert>}

      <Card title="Add allowlisted domain" className="mb-4 max-w-xl">
        <Form method="post" className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm text-base-content/60">myshopify.com domain</span>
            <input type="text" name="domain" required className="input input-sm w-full" placeholder="e.g. store.myshopify.com" />
          </label>
          <button type="submit" name="intent" value="allowlist" className="btn btn-primary btn-sm" disabled={submitting}>
            Add
          </button>
        </Form>
        <p className="mt-2 text-xs text-base-content/50">Allowlisted shops become active automatically when they install the app.</p>
      </Card>

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Shop</th>
              <th>Status</th>
              <th>Installed</th>
              <th className="text-right"></th>
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr>
                <td colSpan={4} className="py-9 text-center text-base-content/60">
                  No shops yet.
                </td>
              </tr>
            )}
            {shops.map((shop) => (
              <tr key={shop.id} className="hover:bg-base-content/[0.03]">
                <td className="align-top">
                  <Link to={`/dashboard/shops/${shop.id}`} className="block truncate font-medium hover:underline">
                    {shop.name}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-base-content/60">{shop.domain}</span>
                </td>
                <td className="align-top">
                  <StatusBadge status={shop.status} />
                </td>
                <td className="align-top tabular-nums">
                  {shop.installedAt ? dateFmt.format(new Date(shop.installedAt)) : <span className="text-base-content/30">—</span>}
                </td>
                <td className="text-right align-top">
                  {shop.status === "PENDING" && (
                    <Form method="post">
                      <input type="hidden" name="shopId" value={shop.id} />
                      <button type="submit" name="intent" value="activate" className="btn btn-primary btn-xs" disabled={submitting}>
                        Activate
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
