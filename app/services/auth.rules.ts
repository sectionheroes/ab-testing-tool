// Pure access rules for the dashboard – no I/O, unit-tested.

export const INTERNAL_DOMAIN = "sectionheroes.de";

export type Role = "ADMIN" | "MEMBER" | "CLIENT";

/**
 * Who may sign in: an invited user (row exists) or anyone with an @sectionheroes.de address (auto-created as MEMBER).
 * Returns the role to use, or null when access is denied.
 */
export function resolveAccess(email: string, existingRole: Role | null): Role | null {
  if (existingRole) return existingRole;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${INTERNAL_DOMAIN}`) ? "MEMBER" : null;
}

export function isInternal(role: Role): boolean {
  return role === "ADMIN" || role === "MEMBER";
}

/**
 * CLIENT may only open /dashboard/shops/:id/* for shops they are linked to.
 * Returns the shop id the path refers to (or null) so the caller can check the UserShop link.
 */
export function clientShopIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/shops\/([^/]+)(\/|$)/);
  return m ? m[1] : null;
}
