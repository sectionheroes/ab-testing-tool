/**
 * Channel classification – contract 4.10, exactly the ten groups and exactly that order of checks.
 *
 * Derived, never stored: the channel of an exposure is recomputed from `Exposure.referrer` and `Exposure.utm` every
 * time a report is drawn, at the moment of **exposure** (last touch), not of purchase. Changing a list below
 * therefore changes old reports too – except for ENDED experiments, which read the frozen snapshot (ADR-0025). That is
 * intended (4.10), and it is why the lists are versioned: `CHANNEL_LISTS_VERSION` moves whenever a host or medium is
 * added, so a report can say which revision it was classified with.
 *
 * Why the numbers will not match Shopify Analytics: different attribution moment (exposure vs. order) and a different
 * model. The results page has to say so under the table (4.10, Hinweispflicht).
 */

/** Bumped by hand whenever one of the lists below changes. Independent of STATS_VERSION (no formula changes here). */
export const CHANNEL_LISTS_VERSION = "1.0.0";

export type Channel =
  | "paid_social"
  | "paid_search"
  | "paid_other"
  | "email"
  | "organic_social"
  | "organic_search"
  | "organic_shopping"
  | "referral"
  | "direct"
  | "unassigned";

/** Every group of 4.10 plus `unknown`, which is not a channel but "no exposure to classify" (an order without `_ab_v`). */
export const CHANNELS: Channel[] = [
  "paid_social",
  "paid_search",
  "paid_other",
  "email",
  "organic_social",
  "organic_search",
  "organic_shopping",
  "referral",
  "direct",
  "unassigned",
];

export type Utm = Record<string, string> | null | undefined;

/** `utm.medium` values that mean paid social when the source or referrer is a social network (4.10, rule 1). */
export const PAID_SOCIAL_MEDIUMS = ["cpc", "ppc", "paid", "paidsocial", "paid_social"];
/** `utm.medium` values that mean paid search when the source or referrer is a search engine (4.10, rule 2). */
export const PAID_SEARCH_MEDIUMS = ["cpc", "ppc", "paid"];
/** `utm.medium` values that mean paid, whatever the source is (4.10, rule 3). */
export const PAID_OTHER_MEDIUMS = ["cpc", "ppc", "paid", "display", "banner", "affiliate"];
/** `utm.medium` values that mean e-mail (4.10, rule 4). */
export const EMAIL_MEDIUMS = ["email", "e-mail", "newsletter"];
/** Substrings in `utm.source` that mean e-mail even without an e-mail medium (4.10, rule 4). */
export const EMAIL_SOURCE_SUBSTRINGS = ["klaviyo", "mailchimp", "brevo"];

/**
 * Registrable-domain fragments of social networks. Matched as a suffix on the referrer host, so `l.instagram.com`,
 * `m.facebook.com` and `lm.facebook.com` all hit `instagram.com` / `facebook.com` without a wildcard list.
 */
export const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "pinterest.de",
  "pin.it",
  "snapchat.com",
  "twitter.com",
  "x.com",
  "t.co",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "threads.net",
  "threads.com",
  "whatsapp.com",
  "telegram.org",
  "t.me",
  "tumblr.com",
  "vk.com",
  "twitch.tv",
];

/** Search engines. Suffix match, so `www.google.de` and `images.google.co.uk` both hit `google.`. */
export const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "ecosia.org",
  "yahoo.com",
  "search.yahoo.com",
  "yandex.com",
  "yandex.ru",
  "baidu.com",
  "qwant.com",
  "startpage.com",
  "brave.com",
  "search.marginalia.nu",
];

/**
 * Marketplaces and price-comparison sites reached by a path rather than a host of their own. Checked before
 * `SEARCH_HOSTS`, because `google.com/shopping` would otherwise be caught by the `google.` search rule.
 */
export const SHOPPING_PATHS = ["google.com/shopping", "google.de/shopping"];

/** Marketplaces and price-comparison sites (4.10 `organic_shopping`). */
export const SHOPPING_HOSTS = [
  "shopping.google.com",
  "idealo.de",
  "idealo.com",
  "amazon.de",
  "amazon.com",
  "amazon.co.uk",
  "ebay.de",
  "ebay.com",
  "billiger.de",
  "geizhals.de",
  "guenstiger.de",
  "kelkoo.de",
  "check24.de",
  "otto.de",
  "kaufland.de",
  "etsy.com",
  "shopping.yahoo.com",
];

/** `utm.source` tokens that name a social network even when no referrer survived (4.10 rule 1: "Quelle/Referrer"). */
export const SOCIAL_SOURCES = [
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "tiktok",
  "pinterest",
  "snapchat",
  "snap",
  "twitter",
  "linkedin",
  "reddit",
  "youtube",
  "threads",
  "whatsapp",
  "telegram",
  "tumblr",
  "twitch",
];

/** `utm.source` tokens that name a search engine (4.10 rule 2). */
export const SEARCH_SOURCES = ["google", "bing", "duckduckgo", "ecosia", "yahoo", "yandex", "baidu", "qwant", "startpage"];

const lower = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * Host of a referrer. Accepts a full URL (`document.referrer`, which is what `Exposure.referrer` holds) as well as a
 * bare host, because the aggregation reduces the referrer to its host in SQL before it groups – classifying a million
 * distinct full URLs one by one would defeat the point of grouping.
 */
export function referrerHost(referrer: string | null | undefined): string {
  const raw = lower(referrer);
  if (!raw) return "";
  // Strip scheme, then userinfo, then path/query/fragment, then the port.
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const authority = withoutScheme.split("/")[0].split("?")[0].split("#")[0];
  const host = authority.split("@").pop() ?? "";
  return host.split(":")[0];
}

/** Path + query of a referrer, lowercased, for the few shopping hosts that are identified by a path (Google Shopping). */
function referrerHostAndPath(referrer: string | null | undefined): string {
  const raw = lower(referrer);
  if (!raw) return "";
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  return withoutScheme.split("?")[0].split("#")[0].replace(/\/+$/, "");
}

const hostMatches = (host: string, needles: string[]): boolean =>
  host !== "" && needles.some((n) => (n.endsWith(".") ? host === n.slice(0, -1) || host.includes(n) : host === n || host.endsWith(`.${n}`)));

const sourceMatches = (source: string, needles: string[]): boolean => source !== "" && needles.some((n) => source === n || source.includes(n));

export type ClassifyOptions = {
  /**
   * Hosts that are the shop itself. A referrer pointing at the shop is not an external referrer (4.10 `referral`), so
   * it is treated as no referrer at all – the visitor came from somewhere inside the shop, which says nothing about
   * the channel. Without this every internal navigation would be counted as a `referral`.
   */
  selfHosts?: string[];
};

/**
 * The ten groups of contract 4.10, first matching rule wins.
 *
 * `referrer` may be a full URL or a bare host; `utm` is the object the exposure payload carried (4.5), i.e. keys
 * without the `utm_` prefix (`source`, `medium`, `campaign`, …).
 */
export function classifyChannel(referrer: string | null | undefined, utm: Utm, opts: ClassifyOptions = {}): Channel {
  const host = referrerHost(referrer);
  const selfHosts = (opts.selfHosts ?? []).map((h) => referrerHost(h)).filter(Boolean);
  const isSelf = host !== "" && selfHosts.some((s) => host === s || host.endsWith(`.${s}`));
  const externalHost = isSelf ? "" : host;
  const hostPath = isSelf ? "" : referrerHostAndPath(referrer);

  const medium = lower(utm?.medium);
  const source = lower(utm?.source);
  // "UTM vorhanden" for the direct/unassigned distinction: any non-empty utm_* value, not just source and medium.
  const hasUtm = !!utm && Object.values(utm).some((v) => lower(v) !== "");

  const social = hostMatches(externalHost, SOCIAL_HOSTS) || sourceMatches(source, SOCIAL_SOURCES);
  const search = hostMatches(externalHost, SEARCH_HOSTS) || sourceMatches(source, SEARCH_SOURCES);

  // 1–3: paid, in the order of 4.10. Paid social beats paid search beats paid other.
  if (PAID_SOCIAL_MEDIUMS.includes(medium) && social) return "paid_social";
  if (PAID_SEARCH_MEDIUMS.includes(medium) && search) return "paid_search";
  if (PAID_OTHER_MEDIUMS.includes(medium)) return "paid_other";

  // 4: e-mail.
  if (EMAIL_MEDIUMS.includes(medium)) return "email";
  if (EMAIL_SOURCE_SUBSTRINGS.some((s) => source.includes(s))) return "email";

  // 5–7: organic, from the referrer host only – a UTM medium that is not paid does not make a visit organic-anything,
  // and a `utm.source` of "google" on a direct hit is not organic search either (there is no referrer to be organic
  // about).
  //
  // Shopping is checked before search, which is the one place this departs from the order 4.10 prints. The two lists
  // overlap: `shopping.google.com` and `google.com/shopping` are shopping surfaces on a search-engine domain, so with
  // search first they would always come back as organic_search. No host is genuinely in both lists, so the swap
  // changes nothing else.
  if (hostMatches(externalHost, SOCIAL_HOSTS)) return "organic_social";
  if (hostPath !== "" && SHOPPING_PATHS.some((h) => hostPath.includes(h))) return "organic_shopping";
  if (hostMatches(externalHost, SHOPPING_HOSTS)) return "organic_shopping";
  if (hostMatches(externalHost, SEARCH_HOSTS)) return "organic_search";

  // 8: any other external referrer.
  if (externalHost !== "") return "referral";

  // 9–10: nothing came in. No UTM either → direct; a UTM that no rule caught → unassigned.
  return hasUtm ? "unassigned" : "direct";
}
