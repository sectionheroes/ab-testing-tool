/**
 * Users — ADMIN only (ADR-0038), both in the sidebar and here: `requireAdmin` answers a MEMBER with a 403 rather
 * than a hidden link, and every mutation checks the role again in `users.server.ts`.
 *
 * An invitation *is* the row. `resolveAccess` lets an existing row sign in with Google and otherwise only an
 * @sectionheroes.de address, so creating the row is what grants access; the name arrives with the first sign-in.
 *
 * A CLIENT gets shop assignments, because the guard in `auth.server.ts` reads them. The client view itself is phase 2
 * (plan §1) — in phase 1 a client who signs in lands on "Nothing here yet", and that is on purpose, not a gap.
 */
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAdmin } from "../services/auth.server";
import { ROLES, ROLE_HINTS, ROLE_LABELS, UserError, inviteUser, listUsers, removeUser, setUserRole, setUserShops } from "../services/users.server";
import { listShopsOverview } from "../services/shops.server";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Checkbox, Input, Select } from "../components/Form";
import { Plus, X } from "../components/icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const me = await requireAdmin(request);
  const [users, shops] = await Promise.all([listUsers(), listShopsOverview()]);
  return {
    meId: me.id,
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    shops: shops.map((s) => ({ id: s.id, name: s.name, domain: s.domain })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const me = await requireAdmin(request);
  const actor = { id: me.id, email: me.email, role: me.role };
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "invite") {
      const role = String(form.get("role") ?? "MEMBER") as UserRole;
      const user = await inviteUser({ email: String(form.get("email") ?? ""), role, shopIds: form.getAll("shopId").map(String) }, actor);
      return { ok: `${user.email} can sign in now.` };
    }
    if (intent === "role") {
      await setUserRole(String(form.get("userId") ?? ""), String(form.get("role") ?? "") as UserRole, actor);
      return { ok: "Role changed." };
    }
    if (intent === "shops") {
      await setUserShops(String(form.get("userId") ?? ""), form.getAll("shopId").map(String), actor);
      return { ok: "Shops updated." };
    }
    if (intent === "remove") {
      await removeUser(String(form.get("userId") ?? ""), actor);
      return { ok: "Removed." };
    }
    return { error: "Unknown action." };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
};

const ROLE_TONE: Record<UserRole, "success" | "neutral" | "info"> = { ADMIN: "success", MEMBER: "neutral", CLIENT: "info" };
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export default function UsersPage() {
  const { users, shops, meId } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";
  const [role, setRole] = useState<UserRole>("MEMBER");

  return (
    <>
      <PageHeader title="Users" />
      {result?.ok && <Alert kind="success">{result.ok}</Alert>}
      {result?.error && <Alert kind="error">{result.error}</Alert>}

      <Card title="Invite someone" className="mb-5 max-w-2xl">
        <Form method="post" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Input name="email" type="email" label="E-mail" placeholder="name@example.com" required className="min-w-[240px] flex-1" />
            <Select name="role" label="Role" value={role} onChange={(e) => setRole(e.currentTarget.value as UserRole)} className="w-44">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <Button type="submit" name="intent" value="invite" styleName="primary" size="md" icon={<Plus size={16} />} disabled={submitting}>
              Invite
            </Button>
          </div>
          <p className="text-xs text-base-content/50">{ROLE_HINTS[role]}</p>
          {role === "CLIENT" && (
            <fieldset className="rounded-lg border border-base-300 p-3">
              <legend className="px-1 text-xs text-base-content/60">Shops</legend>
              <div className="flex flex-wrap gap-4">
                {shops.length === 0 && <span className="text-xs text-base-content/50">No shops yet.</span>}
                {shops.map((s) => (
                  <Checkbox key={s.id} name="shopId" value={s.id} label={s.name} />
                ))}
              </div>
            </fieldset>
          )}
        </Form>
      </Card>

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Shops</th>
              <th className="whitespace-nowrap">Invited</th>
              <th className="text-right"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-9 text-center text-base-content/60">
                  Nobody yet.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id}>
                <td className="align-top">
                  <span className="block truncate font-medium">{user.name ?? "—"}</span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-base-content/60">{user.email}</span>
                </td>
                <td className="align-top">
                  {user.id === meId ? (
                    <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]} · you</Badge>
                  ) : (
                    <Form method="post" onChange={(e) => e.currentTarget.requestSubmit()}>
                      <input type="hidden" name="intent" value="role" />
                      <input type="hidden" name="userId" value={user.id} />
                      <Select name="role" size="sm" defaultValue={user.role} aria-label={`Role of ${user.email}`} className="w-32">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </Form>
                  )}
                </td>
                <td className="align-top">
                  {user.role !== "CLIENT" ? (
                    <span className="text-xs text-base-content/50">all</span>
                  ) : (
                    <Form method="post" className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="intent" value="shops" />
                      <input type="hidden" name="userId" value={user.id} />
                      {shops.map((s) => (
                        <Checkbox
                          key={s.id}
                          name="shopId"
                          value={s.id}
                          defaultChecked={user.shops.some((us) => us.id === s.id)}
                          label={<span className="text-xs">{s.name}</span>}
                        />
                      ))}
                      <Button type="submit" styleName="ghost-outline" size="sm" disabled={submitting}>
                        Save
                      </Button>
                    </Form>
                  )}
                </td>
                <td className="whitespace-nowrap align-top tabular-nums">{dateFmt.format(new Date(user.createdAt))}</td>
                <td className="text-right align-top">
                  {user.id !== meId && (
                    <Form method="post" className="inline-block">
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        name="intent"
                        value="remove"
                        aria-label={`Remove ${user.email}`}
                        className="text-base-content/30 transition-colors hover:text-error"
                      >
                        <X size={16} />
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
