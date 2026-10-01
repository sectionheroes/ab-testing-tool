/**
 * Users: every mutation is ADMIN-only and the check sits in the service layer (ADR-0038), plus the invariant that is
 * easiest to lose by accident — the last admin can neither be demoted nor removed, because there would be no way
 * back into shops and users afterwards.
 *
 * Every case runs inside a rolled-back transaction (CLAUDE.md). The "last admin" case therefore counts admins inside
 * the transaction, where the fixture's own admins are the only ones that exist.
 */
import { describe, expect, it } from "vitest";
import type { Tx } from "../../test/db/fixture";
import { inRollback } from "../../test/db/fixture";
import { inviteUser, listUsers, removeUser, setUserRole, setUserShops } from "./users.server";

const MEMBER = { id: "m", email: "member@sectionheroes.de", role: "MEMBER" as const };
const CLIENT = { id: "c", email: "client@example.com", role: "CLIENT" as const };

const unique = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** A throwaway admin inside the transaction, to act as. */
async function seedAdmin(tx: Tx) {
  const row = await tx.user.create({ data: { email: `${unique()}@sectionheroes.de`, role: "ADMIN" } });
  return { id: row.id, email: row.email, role: "ADMIN" as const };
}

describe("every mutation is ADMIN-only (ADR-0038)", () => {
  it("rejects a MEMBER and a CLIENT", async () => {
    await inRollback(async (tx) => {
      for (const actor of [MEMBER, CLIENT]) {
        await expect(inviteUser({ email: "x@example.com", role: "MEMBER" }, actor, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(setUserRole("any", "ADMIN", actor, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(setUserShops("any", [], actor, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(removeUser("any", actor, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });
  });

  it("the role check runs before anything is written", async () => {
    await inRollback(async (tx) => {
      const email = `${unique()}@example.com`;
      await expect(inviteUser({ email, role: "MEMBER" }, MEMBER, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(tx.user.findUnique({ where: { email } })).resolves.toBeNull();
    });
  });
});

describe("inviteUser", () => {
  it("creates the row that lets someone sign in", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const email = `${unique()}@example.com`;
      const invited = await inviteUser({ email: email.toUpperCase(), role: "MEMBER" }, admin, tx);
      expect(invited.email).toBe(email);
      expect(invited.role).toBe("MEMBER");
      expect(invited.name).toBeNull(); // the name arrives with the first Google sign-in
    });
  });

  it("gives shops to a CLIENT and silently drops them for anyone else", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Shop", status: "ACTIVE" } });

      const client = await inviteUser({ email: `${unique()}@example.com`, role: "CLIENT", shopIds: [shop.id] }, admin, tx);
      await expect(tx.userShop.count({ where: { userId: client.id } })).resolves.toBe(1);

      // ADMIN and MEMBER see every shop, so an assignment on them would be a lie.
      const member = await inviteUser({ email: `${unique()}@example.com`, role: "MEMBER", shopIds: [shop.id] }, admin, tx);
      await expect(tx.userShop.count({ where: { userId: member.id } })).resolves.toBe(0);
    });
  });

  it("refuses a second invitation and an address that is not one", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const email = `${unique()}@example.com`;
      await inviteUser({ email, role: "MEMBER" }, admin, tx);
      await expect(inviteUser({ email, role: "MEMBER" }, admin, tx)).rejects.toMatchObject({ code: "EXISTS" });
      await expect(inviteUser({ email: "not-an-address", role: "MEMBER" }, admin, tx)).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    });
  });
});

describe("roles", () => {
  it("changing a role drops shop links that no longer mean anything", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Shop", status: "ACTIVE" } });
      const client = await inviteUser({ email: `${unique()}@example.com`, role: "CLIENT", shopIds: [shop.id] }, admin, tx);

      await setUserRole(client.id, "MEMBER", admin, tx);
      await expect(tx.userShop.count({ where: { userId: client.id } })).resolves.toBe(0);
    });
  });

  it("nobody changes or removes themselves", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      await expect(setUserRole(admin.id, "MEMBER", admin, tx)).rejects.toMatchObject({ code: "SELF" });
      await expect(removeUser(admin.id, admin, tx)).rejects.toMatchObject({ code: "SELF" });
    });
  });

  it("the last admin can neither be demoted nor removed", async () => {
    await inRollback(async (tx) => {
      // Two admins: one acts, one is the target. Demoting the target is fine while the actor is still an admin…
      const actor = await seedAdmin(tx);
      const target = await seedAdmin(tx);
      const others = await tx.user.count({ where: { role: "ADMIN", id: { notIn: [actor.id, target.id] } } });
      await expect(setUserRole(target.id, "MEMBER", actor, tx)).resolves.toMatchObject({ role: "MEMBER" });

      if (others > 0) return; // a real admin row exists in this database; the invariant cannot be exercised here
      // …and now the actor is the last one. A different admin trying to demote or remove them is refused.
      const second = await tx.user.create({ data: { email: `${unique()}@sectionheroes.de`, role: "MEMBER" } });
      const impostor = { id: second.id, email: second.email, role: "ADMIN" as const };
      await expect(setUserRole(actor.id, "MEMBER", impostor, tx)).rejects.toMatchObject({ code: "LAST_ADMIN" });
      await expect(removeUser(actor.id, impostor, tx)).rejects.toMatchObject({ code: "LAST_ADMIN" });
    });
  });
});

describe("setUserShops", () => {
  it("only applies to a CLIENT", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const member = await inviteUser({ email: `${unique()}@example.com`, role: "MEMBER" }, admin, tx);
      await expect(setUserShops(member.id, [], admin, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("replaces the assignment rather than adding to it", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const one = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "One", status: "ACTIVE" } });
      const two = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Two", status: "ACTIVE" } });
      const client = await inviteUser({ email: `${unique()}@example.com`, role: "CLIENT", shopIds: [one.id] }, admin, tx);

      await setUserShops(client.id, [two.id], admin, tx);
      const links = await tx.userShop.findMany({ where: { userId: client.id } });
      expect(links.map((l) => l.shopId)).toEqual([two.id]);

      const listed = (await listUsers(tx)).find((u) => u.id === client.id);
      expect(listed?.shops.map((s) => s.id)).toEqual([two.id]);
    });
  });
});

describe("removeUser", () => {
  it("takes the shop links and the API tokens with it", async () => {
    await inRollback(async (tx) => {
      const admin = await seedAdmin(tx);
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Shop", status: "ACTIVE" } });
      const client = await inviteUser({ email: `${unique()}@example.com`, role: "CLIENT", shopIds: [shop.id] }, admin, tx);
      await tx.apiToken.create({ data: { userId: client.id, tokenHash: unique(), label: "cli", expiresAt: new Date("2027-01-01") } });

      await removeUser(client.id, admin, tx);
      await expect(tx.user.findUnique({ where: { id: client.id } })).resolves.toBeNull();
      await expect(tx.userShop.count({ where: { userId: client.id } })).resolves.toBe(0);
      await expect(tx.apiToken.count({ where: { userId: client.id } })).resolves.toBe(0);
    });
  });
});
