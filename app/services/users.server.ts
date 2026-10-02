/**
 * Dashboard users (plan WP5a). A row is created by an **invitation**, not by a login: `resolveAccess` in
 * `auth.rules.ts` lets an existing row in, and otherwise only an @sectionheroes.de address. So inviting someone is
 * exactly "create the row"; the name arrives when they first sign in with Google.
 *
 * Every mutation here is ADMIN-only and the check sits in this file, not in the route (ADR-0038) — the API and the
 * CLI (5c) call the same functions.
 *
 * `CLIENT` is the read-only client role. It gets shop assignments so the guard in `auth.server.ts` knows which shops
 * it may see; the client view itself is phase 2, so in phase 1 a client lands on "Nothing here yet" (plan §1).
 */
import type { Prisma, User, UserRole } from "@prisma/client";
import prisma from "../db.server";

/** Pass a transaction client so the database tests can run inside a rolled-back transaction (CLAUDE.md). */
export type Db = Prisma.TransactionClient;

export class UserError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "EXISTS" | "NOT_FOUND" | "INVALID_EMAIL" | "LAST_ADMIN" | "SELF",
  ) {
    super(message);
  }
}

export type Actor = { id: string; email: string; role: UserRole };

export const ROLES: UserRole[] = ["ADMIN", "MEMBER", "CLIENT"];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
  CLIENT: "Client",
};

export const ROLE_HINTS: Record<UserRole, string> = {
  ADMIN: "Everything, including shops and users.",
  MEMBER: "Every shop and every test, but cannot add shops or invite people.",
  CLIENT: "Read-only, and only the shops you assign below.",
};

function requireAdmin(actor: Actor, what: string): void {
  if (actor.role !== "ADMIN") throw new UserError(`Only an admin can ${what}.`, "FORBIDDEN");
}

/** Deliberately loose: the real gate is the Google sign-in, this only catches a typo before it becomes a row. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  shops: { id: string; name: string; domain: string }[];
};

export async function listUsers(db: Db = prisma): Promise<UserRow[]> {
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: { shops: { include: { shop: { select: { id: true, name: true, domain: true } } } } },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    shops: u.shops.map((s) => s.shop),
  }));
}

export async function inviteUser(
  input: { email: string; role: UserRole; shopIds?: string[] },
  actor: Actor,
  db: Db = prisma,
): Promise<User> {
  requireAdmin(actor, "invite people");
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new UserError("That does not look like an e-mail address.", "INVALID_EMAIL");
  if (!ROLES.includes(input.role)) throw new UserError("Pick a role.", "NOT_FOUND");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new UserError(`${email} is already invited.`, "EXISTS");

  // Only a CLIENT is scoped to shops; ADMIN and MEMBER see everything, so an assignment on them would be a lie.
  const shopIds = input.role === "CLIENT" ? (input.shopIds ?? []) : [];
  return db.user.create({
    data: { email, role: input.role, shops: { create: shopIds.map((shopId) => ({ shopId })) } },
  });
}

export async function setUserRole(userId: string, role: UserRole, actor: Actor, db: Db = prisma): Promise<User> {
  requireAdmin(actor, "change a role");
  if (userId === actor.id) throw new UserError("You cannot change your own role.", "SELF");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("User not found.", "NOT_FOUND");
  await guardLastAdmin(user.id, user.role, role, db);
  // Leaving ADMIN/MEMBER drops the shop links – they never meant anything for those roles.
  if (role !== "CLIENT") await db.userShop.deleteMany({ where: { userId } });
  return db.user.update({ where: { id: userId }, data: { role } });
}

export async function setUserShops(userId: string, shopIds: string[], actor: Actor, db: Db = prisma): Promise<void> {
  requireAdmin(actor, "assign shops");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("User not found.", "NOT_FOUND");
  if (user.role !== "CLIENT") throw new UserError("Only a client is limited to specific shops.", "FORBIDDEN");
  await db.userShop.deleteMany({ where: { userId } });
  await db.userShop.createMany({ data: shopIds.map((shopId) => ({ userId, shopId })) });
}

export async function removeUser(userId: string, actor: Actor, db: Db = prisma): Promise<void> {
  requireAdmin(actor, "remove people");
  if (userId === actor.id) throw new UserError("You cannot remove yourself.", "SELF");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("User not found.", "NOT_FOUND");
  await guardLastAdmin(user.id, user.role, null, db);
  await db.userShop.deleteMany({ where: { userId } });
  await db.apiToken.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
}

/** Removing or demoting the last admin would lock everyone out of shops and users with no way back in. */
async function guardLastAdmin(userId: string, from: UserRole, to: UserRole | null, db: Db): Promise<void> {
  if (from !== "ADMIN" || to === "ADMIN") return;
  const admins = await db.user.count({ where: { role: "ADMIN", id: { not: userId } } });
  if (admins === 0) throw new UserError("This is the last admin. Make someone else an admin first.", "LAST_ADMIN");
}
