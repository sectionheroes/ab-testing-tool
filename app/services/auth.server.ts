import { createCookieSessionStorage, redirect } from "react-router";
import { Google, decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import type { User } from "@prisma/client";
import prisma from "../db.server";
import { env, isProduction } from "../env.server";
import { clientShopIdFromPath, isInternal, resolveAccess } from "./auth.rules";

// ── Session cookie (30 days, httpOnly, signed) ───────────────────────────────

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

const sessionStorage = createCookieSessionStorage<{ userId: string }>({
  cookie: {
    name: "shab_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    secrets: [env("SESSION_SECRET")],
    maxAge: SESSION_MAX_AGE,
  },
});

// Short-lived cookie carrying OAuth state + PKCE verifier between /login and /login/callback.
const oauthStorage = createCookieSessionStorage<{ state: string; verifier: string; returnTo: string }>({
  cookie: {
    name: "shab_oauth",
    httpOnly: true,
    sameSite: "lax",
    path: "/login",
    secure: isProduction,
    secrets: [env("SESSION_SECRET")],
    maxAge: 10 * 60,
  },
});

// ── Google OAuth (Authorization Code + PKCE) ─────────────────────────────────

/** Redirect URI is derived from the request, not SHOPIFY_APP_URL: locally the dashboard runs on http://localhost:3000. */
function google(request: Request) {
  const url = new URL(request.url);
  const origin = isProduction ? env("SHOPIFY_APP_URL") : `${url.protocol}//${url.host}`;
  return new Google(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"), `${origin}/login/callback`);
}

export async function startGoogleLogin(request: Request, returnTo = "/dashboard"): Promise<Response> {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google(request).createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  const session = await oauthStorage.getSession();
  session.set("state", state);
  session.set("verifier", verifier);
  session.set("returnTo", returnTo);
  return redirect(url.toString(), { headers: { "Set-Cookie": await oauthStorage.commitSession(session) } });
}

export type LoginResult = { ok: true; response: Response } | { ok: false; reason: "state" | "denied" | "provider" };

export async function finishGoogleLogin(request: Request): Promise<LoginResult> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauth = await oauthStorage.getSession(request.headers.get("Cookie"));
  const clear = { "Set-Cookie": await oauthStorage.destroySession(oauth) };

  if (!code || !state || state !== oauth.get("state") || !oauth.get("verifier")) {
    return { ok: false, reason: "state" };
  }

  let email: string | undefined;
  let name: string | undefined;
  try {
    const tokens = await google(request).validateAuthorizationCode(code, oauth.get("verifier")!);
    const claims = decodeIdToken(tokens.idToken()) as { email?: string; email_verified?: boolean; name?: string };
    if (claims.email_verified === false) return { ok: false, reason: "denied" };
    email = claims.email?.toLowerCase();
    name = claims.name;
  } catch {
    return { ok: false, reason: "provider" };
  }
  if (!email) return { ok: false, reason: "denied" };

  const existing = await prisma.user.findUnique({ where: { email } });
  const role = resolveAccess(email, existing?.role ?? null);
  if (!role) return { ok: false, reason: "denied" };

  const user = existing
    ? await prisma.user.update({ where: { email }, data: { name: existing.name ?? name } })
    : await prisma.user.create({ data: { email, name, role } });

  const session = await sessionStorage.getSession();
  session.set("userId", user.id);
  const returnTo = oauth.get("returnTo") || "/dashboard";
  const headers = new Headers(clear);
  headers.append("Set-Cookie", await sessionStorage.commitSession(session));
  return { ok: true, response: redirect(safeReturnTo(returnTo), { headers }) };
}

export async function logout(request: Request): Promise<Response> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/login", { headers: { "Set-Cookie": await sessionStorage.destroySession(session) } });
}

// ── Guards ───────────────────────────────────────────────────────────────────

export async function getUser(request: Request): Promise<User | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Signed-in user or redirect to /login. CLIENT is confined to /dashboard/shops/:id/* of linked shops. */
export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  const url = new URL(request.url);
  if (!user) throw redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  if (isInternal(user.role)) return user;

  const shopId = clientShopIdFromPath(url.pathname);
  const links = await prisma.userShop.findMany({ where: { userId: user.id }, select: { shopId: true } });
  if (shopId && links.some((l) => l.shopId === shopId)) return user;
  if (links.length && url.pathname !== `/dashboard/shops/${links[0].shopId}`) {
    throw redirect(`/dashboard/shops/${links[0].shopId}`);
  }
  if (!links.length && url.pathname !== "/dashboard/nothing-here") throw redirect("/dashboard/nothing-here");
  return user;
}

export async function requireInternal(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (!isInternal(user.role)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") throw new Response("Forbidden", { status: 403 });
  return user;
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
