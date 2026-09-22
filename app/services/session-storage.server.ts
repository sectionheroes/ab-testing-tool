import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { Session } from "@shopify/shopify-app-react-router/server";
import type { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "./crypto.server";

/**
 * SessionStorage for @shopify/shopify-app-react-router backed by the Shop row (plan §3) instead of the
 * template's Session table. Offline tokens only. Everything token-like is encrypted at rest.
 *
 * Status transitions on storeSession (the point where an install becomes visible to us):
 *   no row          → PENDING
 *   ALLOWLISTED     → ACTIVE
 *   UNINSTALLED     → ACTIVE if it had been activated before, else PENDING
 *   PENDING/ACTIVE  → unchanged (token refresh / re-auth)
 *
 * loadSession returns a session for PENDING shops too – /app must render the activation form,
 * not bounce through OAuth forever.
 */
export class ShopSessionStorage implements SessionStorage {
  /** onActivated fires after a row turned ACTIVE here (allowlisted install / reinstall) – the first config write (WP3). */
  constructor(
    private readonly db: PrismaClient,
    private readonly onActivated?: (shopId: string) => Promise<void>,
  ) {}

  async storeSession(session: Session): Promise<boolean> {
    if (session.isOnline) throw new Error("ShopSessionStorage stores offline sessions only");
    const domain = session.shop;
    const encryptedSession = encrypt(JSON.stringify(session.toPropertyArray()));
    const accessToken = session.accessToken ? encrypt(session.accessToken) : null;
    const existing = await this.db.shop.findUnique({ where: { domain } });

    if (!existing) {
      await this.db.shop.create({
        data: {
          domain,
          name: domain.replace(".myshopify.com", ""),
          status: "PENDING",
          accessToken,
          session: encryptedSession,
          scope: session.scope ?? null,
          installedAt: new Date(),
        },
      });
      return true;
    }

    let status = existing.status;
    if (existing.status === "ALLOWLISTED") status = "ACTIVE";
    else if (existing.status === "UNINSTALLED") status = existing.activatedAt ? "ACTIVE" : "PENDING";

    await this.db.shop.update({
      where: { domain },
      data: {
        status,
        accessToken,
        session: encryptedSession,
        scope: session.scope ?? existing.scope,
        installedAt: existing.status === "UNINSTALLED" || !existing.installedAt ? new Date() : existing.installedAt,
        activatedAt: status === "ACTIVE" && !existing.activatedAt ? new Date() : existing.activatedAt,
      },
    });
    if (status === "ACTIVE" && existing.status !== "ACTIVE" && this.onActivated) {
      await this.onActivated(existing.id).catch((err) => console.error(`[session] onActivated failed for ${domain}`, err));
    }
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const domain = domainFromSessionId(id);
    if (!domain) return undefined;
    const shop = await this.db.shop.findUnique({ where: { domain } });
    if (!shop || !shop.session) return undefined;
    if (shop.status === "ALLOWLISTED" || shop.status === "UNINSTALLED") return undefined;
    const session = Session.fromPropertyArray(JSON.parse(decrypt(shop.session)));
    return session.id === id ? session : undefined;
  }

  /** Called by the library when a token turned out invalid. Drops tokens, never touches status – only app/uninstalled does that. */
  async deleteSession(id: string): Promise<boolean> {
    const domain = domainFromSessionId(id);
    if (!domain) return false;
    await this.db.shop.updateMany({ where: { domain }, data: { accessToken: null, session: null } });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) await this.deleteSession(id);
    return true;
  }

  async findSessionsByShop(domain: string): Promise<Session[]> {
    const session = await this.loadSession(`offline_${domain}`);
    return session ? [session] : [];
  }
}

export function domainFromSessionId(id: string): string | undefined {
  return id.startsWith("offline_") ? id.slice("offline_".length) : undefined;
}
