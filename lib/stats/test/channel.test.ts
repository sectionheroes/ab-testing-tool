/**
 * Contract 4.10, table-driven over all ten groups plus the precedence cases the contract calls out: paid social beats
 * organic social, and a UTM beats the referrer.
 */
import { describe, expect, it } from "vitest";
import { CHANNELS, classifyChannel, referrerHost, type Channel, type Utm } from "../index";

type Case = { name: string; referrer: string | null; utm: Utm; expected: Channel };

const SHOP = "kunde.myshopify.com";
const opts = { selfHosts: [SHOP] };

const cases: Case[] = [
  // 1 paid_social – paid medium AND a social source or referrer
  { name: "Meta ad, utm source ig", referrer: "https://l.instagram.com/", utm: { source: "ig", medium: "paid" }, expected: "paid_social" },
  { name: "Meta ad, medium paid_social", referrer: null, utm: { source: "facebook", medium: "paid_social" }, expected: "paid_social" },
  { name: "TikTok ad, medium cpc", referrer: "https://www.tiktok.com/", utm: { source: "tiktok", medium: "cpc" }, expected: "paid_social" },
  { name: "Pinterest ad, medium paidsocial", referrer: null, utm: { source: "pinterest", medium: "paidsocial" }, expected: "paid_social" },
  { name: "social referrer, medium ppc, no utm source", referrer: "https://m.facebook.com/", utm: { medium: "ppc" }, expected: "paid_social" },

  // 2 paid_search – paid medium AND a search source or referrer
  { name: "Google Ads", referrer: "https://www.google.de/", utm: { source: "google", medium: "cpc" }, expected: "paid_search" },
  { name: "Bing Ads, no referrer", referrer: null, utm: { source: "bing", medium: "cpc" }, expected: "paid_search" },
  { name: "search referrer, medium paid", referrer: "https://duckduckgo.com/", utm: { medium: "paid" }, expected: "paid_search" },

  // 3 paid_other – paid medium, source is neither social nor search
  { name: "display network", referrer: null, utm: { source: "criteo", medium: "display" }, expected: "paid_other" },
  { name: "banner", referrer: "https://blog.example.com/", utm: { source: "partnerblog", medium: "banner" }, expected: "paid_other" },
  { name: "affiliate", referrer: null, utm: { source: "someaffiliate", medium: "affiliate" }, expected: "paid_other" },
  { name: "cpc on an unknown source", referrer: null, utm: { source: "unknownnetwork", medium: "cpc" }, expected: "paid_other" },

  // 4 email
  { name: "medium email", referrer: null, utm: { source: "newsletter", medium: "email" }, expected: "email" },
  { name: "medium e-mail", referrer: null, utm: { source: "shop", medium: "e-mail" }, expected: "email" },
  { name: "medium newsletter", referrer: null, utm: { source: "shop", medium: "newsletter" }, expected: "email" },
  { name: "Klaviyo by source alone", referrer: null, utm: { source: "klaviyo", medium: "flow" }, expected: "email" },
  { name: "Mailchimp by source alone", referrer: null, utm: { source: "mailchimp-campaign" }, expected: "email" },
  { name: "Brevo by source alone", referrer: null, utm: { source: "brevo" }, expected: "email" },

  // 5 organic_social – social referrer, no paid medium
  { name: "Instagram bio link", referrer: "https://l.instagram.com/", utm: null, expected: "organic_social" },
  { name: "Facebook share", referrer: "https://www.facebook.com/", utm: null, expected: "organic_social" },
  { name: "t.co (Twitter/X)", referrer: "https://t.co/abc123", utm: null, expected: "organic_social" },
  { name: "Reddit thread", referrer: "https://www.reddit.com/r/shopify/comments/x", utm: null, expected: "organic_social" },
  { name: "YouTube description", referrer: "https://www.youtube.com/watch?v=x", utm: null, expected: "organic_social" },
  { name: "social referrer with an organic utm medium", referrer: "https://www.tiktok.com/", utm: { medium: "social" }, expected: "organic_social" },

  // 6 organic_search – search referrer, no paid medium
  { name: "Google", referrer: "https://www.google.com/", utm: null, expected: "organic_search" },
  { name: "Google country domain", referrer: "https://www.google.co.uk/search?q=x", utm: null, expected: "organic_search" },
  { name: "Bing", referrer: "https://www.bing.com/search?q=x", utm: null, expected: "organic_search" },
  { name: "Ecosia", referrer: "https://www.ecosia.org/", utm: null, expected: "organic_search" },
  { name: "DuckDuckGo with an organic medium", referrer: "https://duckduckgo.com/", utm: { medium: "organic" }, expected: "organic_search" },

  // 7 organic_shopping – marketplace or price comparison
  { name: "Google Shopping (own host)", referrer: "https://shopping.google.com/", utm: null, expected: "organic_shopping" },
  { name: "Google Shopping (path on the search host)", referrer: "https://www.google.com/shopping/product/1", utm: null, expected: "organic_shopping" },
  { name: "Idealo", referrer: "https://www.idealo.de/preisvergleich/x", utm: null, expected: "organic_shopping" },
  { name: "Amazon", referrer: "https://www.amazon.de/dp/x", utm: null, expected: "organic_shopping" },
  { name: "Check24", referrer: "https://www.check24.de/", utm: null, expected: "organic_shopping" },

  // 8 referral – any other external referrer
  { name: "a blog", referrer: "https://blog.example.com/post", utm: null, expected: "referral" },
  { name: "a forum", referrer: "https://forum.example.org/thread/1", utm: null, expected: "referral" },
  { name: "another shop", referrer: "https://andershop.myshopify.com/", utm: null, expected: "referral" },

  // 9 direct – no referrer, no utm
  { name: "typed in", referrer: null, utm: null, expected: "direct" },
  { name: "empty referrer string", referrer: "", utm: null, expected: "direct" },
  { name: "empty utm object", referrer: null, utm: {}, expected: "direct" },
  { name: "utm with only empty values", referrer: null, utm: { source: "", medium: "" }, expected: "direct" },
  { name: "internal navigation inside the shop", referrer: `https://${SHOP}/products/x`, utm: null, expected: "direct" },

  // 10 unassigned – a utm was there but no rule caught it
  { name: "medium nobody defined", referrer: null, utm: { source: "somewhere", medium: "qr-code" }, expected: "unassigned" },
  { name: "campaign only", referrer: null, utm: { campaign: "spring-sale" }, expected: "unassigned" },
  { name: "source only, unknown", referrer: null, utm: { source: "print-flyer" }, expected: "unassigned" },
];

describe("classifyChannel – contract 4.10, all ten groups", () => {
  for (const c of cases) {
    it(`${c.expected}: ${c.name}`, () => {
      expect(classifyChannel(c.referrer, c.utm, opts)).toBe(c.expected);
    });
  }

  it("covers every one of the ten groups at least once", () => {
    const seen = new Set(cases.map((c) => c.expected));
    expect([...seen].sort()).toEqual([...CHANNELS].sort());
  });
});

describe("precedence – the cases 4.10 calls out by name", () => {
  it("paid social beats organic social: the same referrer, only the medium differs", () => {
    const referrer = "https://l.instagram.com/";
    expect(classifyChannel(referrer, null, opts)).toBe("organic_social");
    expect(classifyChannel(referrer, { medium: "paid" }, opts)).toBe("paid_social");
  });

  it("paid search beats organic search: the same referrer, only the medium differs", () => {
    const referrer = "https://www.google.com/";
    expect(classifyChannel(referrer, null, opts)).toBe("organic_search");
    expect(classifyChannel(referrer, { medium: "cpc" }, opts)).toBe("paid_search");
  });

  it("a UTM beats the referrer: a Google referrer with a paid social UTM is paid social, not paid search", () => {
    expect(classifyChannel("https://www.google.com/", { source: "instagram", medium: "cpc" }, opts)).toBe("paid_social");
  });

  it("a UTM beats the referrer: an e-mail UTM on an organic-search referrer is e-mail", () => {
    expect(classifyChannel("https://www.google.com/", { source: "klaviyo", medium: "email" }, opts)).toBe("email");
  });

  it("paid social beats paid search when the source is social and the referrer is a search engine", () => {
    expect(classifyChannel("https://www.bing.com/", { source: "facebook", medium: "paid" }, opts)).toBe("paid_social");
  });

  it("paid_other catches a paid medium the first two rules did not", () => {
    // `display` is not in the paid-social or paid-search lists, so even a social source lands in paid_other.
    expect(classifyChannel("https://www.facebook.com/", { source: "facebook", medium: "display" }, opts)).toBe("paid_other");
  });

  it("e-mail is checked after paid: a cpc medium with a Klaviyo source is paid, not e-mail", () => {
    expect(classifyChannel(null, { source: "klaviyo", medium: "cpc" }, opts)).toBe("paid_other");
  });

  it("shopping on a search host beats organic search", () => {
    expect(classifyChannel("https://www.google.com/shopping/product/1", null, opts)).toBe("organic_shopping");
    expect(classifyChannel("https://www.google.com/search?q=x", null, opts)).toBe("organic_search");
  });
});

describe("robustness", () => {
  it("an empty call is direct", () => {
    expect(classifyChannel(null, null)).toBe("direct");
    expect(classifyChannel(undefined, undefined)).toBe("direct");
  });

  it("is case-insensitive on hosts and on utm values", () => {
    expect(classifyChannel("HTTPS://WWW.GOOGLE.COM/", null, opts)).toBe("organic_search");
    expect(classifyChannel(null, { source: "Instagram", medium: "PAID" }, opts)).toBe("paid_social");
  });

  it("accepts a bare host as well as a full URL – the aggregation groups by host in SQL", () => {
    expect(classifyChannel("www.instagram.com", null, opts)).toBe("organic_social");
    expect(classifyChannel("https://www.instagram.com/p/x", null, opts)).toBe("organic_social");
  });

  it("without selfHosts an internal referrer looks like a referral – which is why the caller passes the shop domain", () => {
    expect(classifyChannel(`https://${SHOP}/products/x`, null)).toBe("referral");
    expect(classifyChannel(`https://${SHOP}/products/x`, null, opts)).toBe("direct");
  });

  it("treats a subdomain of the shop as the shop", () => {
    expect(classifyChannel("https://shop.kunde.myshopify.com/cart", null, opts)).toBe("direct");
  });

  it("does not mistake a lookalike host for the shop", () => {
    expect(classifyChannel("https://notkunde.myshopify.com/", null, opts)).toBe("referral");
  });

  it("an internal referrer with a UTM is unassigned, not a referral", () => {
    expect(classifyChannel(`https://${SHOP}/x`, { source: "print-flyer" }, opts)).toBe("unassigned");
  });

  it("survives a malformed referrer without throwing", () => {
    for (const bad of ["not a url", "http://", "://x", "//", "javascript:void(0)"]) {
      expect(CHANNELS).toContain(classifyChannel(bad, null, opts));
    }
  });
});

describe("referrerHost", () => {
  const cases: [string | null, string][] = [
    ["https://www.google.com/search?q=x", "www.google.com"],
    ["http://example.com", "example.com"],
    ["https://example.com:8443/path", "example.com"],
    ["https://user:pw@example.com/path", "example.com"],
    ["example.com/path", "example.com"],
    ["https://EXAMPLE.com/", "example.com"],
    [null, ""],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(referrerHost(input)).toBe(expected);
    });
  }
});
