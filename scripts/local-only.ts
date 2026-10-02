/**
 * Guard for the two development scripts that write demo rows and mint a session cookie: they may only ever touch a
 * **local** database. The production database is on Render (CLAUDE.md: "The Render database is production only – never
 * point a local .env at it"), and a seeding script that runs there once is a very bad afternoon.
 */
export function requireLocalDatabase(script: string): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${script}: DATABASE_URL is not a URL. Run with --env-file=.env against the local Postgres.`);
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`${script}: refuses to run against ${host}. This script is for the local development database only.`);
  }
}
