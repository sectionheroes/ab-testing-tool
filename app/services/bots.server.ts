import { isbot } from "isbot";

/**
 * Server-side bot flag for Exposure.isBot (contract 4.5 / 4.8). The snippet already bails out on navigator.webdriver and
 * this regex – here we re-check the UA with the same regex (duplicated on purpose: app/** must not import lib/snippet)
 * plus isbot's crawler list. Missing UA counts as bot: no real browser sends none.
 */
export const SNIPPET_BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix/i;

export function isBotUa(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return SNIPPET_BOT_RE.test(ua) || isbot(ua);
}
