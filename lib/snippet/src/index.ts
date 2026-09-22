// sh-ab client snippet. Runs synchronously in <head> after `window.__shab = { config, customerId, shop }`.
// Every path is wrapped: whatever fails, the merchant's page renders as it would without us.
import { applyCss, applyJs, hide, reveal } from "./apply";
import { buildAbValue, type Pair } from "./attribute";
import { announce, post, reportError, type ExposurePayload } from "./beacon";
import { bucket } from "./bucket";
import { injectHiddenInputs, syncCartAttribute } from "./cart";
import { device, isBot, ls, onReady, ss, storageOk, utm } from "./env";
import { resolveForce, type Force } from "./force";
import { matches } from "./targeting";
import type { Config, Experiment, Shab, Variant } from "./types";
import { getVisitorId } from "./visitor";

type Active = { exp: Experiment; variant: Variant; forced: boolean; failed?: unknown };

const EXP_MARKER = "_shab_exp:";
const LINK_MARKER = "_shab_link";

function main(): void {
  const shab: Shab | undefined = window.__shab;
  if (!shab || !shab.config || shab.config.v !== 1) return;
  if (isBot() || !storageOk()) return;
  const force = resolveForce(location.search);
  if (force === "off") return; // fully passive: no id, no observers, no cart changes
  const start = () => run(shab.config as Config, shab, force);
  if (shab.config.requireConsent) consentGate(start);
  else start();
}

/** 8.2: only with Shopify.customerPrivacy.analyticsProcessingAllowed() – now or after `visitorConsentCollected`. */
function consentGate(fn: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    try {
      fn();
    } catch {
      /* never break the page */
    }
  };
  const check = (): boolean => {
    const cp = window.Shopify && window.Shopify.customerPrivacy;
    if (cp && typeof cp.analyticsProcessingAllowed === "function" && cp.analyticsProcessingAllowed()) {
      once();
      return true;
    }
    return false;
  };
  document.addEventListener("visitorConsentCollected", () => {
    check();
  });
  const load = (): boolean => {
    const s = window.Shopify;
    if (!s) return false;
    if (s.customerPrivacy) {
      check();
      return true;
    }
    if (typeof s.loadFeatures === "function") {
      s.loadFeatures([{ name: "consent-tracking-api", version: "0.1" }], (err) => {
        if (!err) check();
      });
      return true;
    }
    return false;
  };
  if (!load()) onReady(load); // Shopify.loadFeatures may not exist yet while <head> is still streaming
}

function run(cfg: Config, shab: Shab, force: Force): void {
  const vid = getVisitorId();
  const ctx = { pathname: location.pathname, search: location.search, device: device() };
  const experiments = cfg.experiments.filter((e) => e && e.status === "running").sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const active: Active[] = [];
  for (const exp of experiments) {
    const forcedKey = force && force !== "off" ? force[exp.key] : undefined;
    if (forcedKey) {
      const v = exp.variants.filter((x) => x.key === forcedKey)[0];
      if (v) active.push({ exp, variant: v, forced: true });
      continue;
    }
    if (!matches(exp, ctx)) continue;
    const key = bucket(vid, exp);
    if (key === null) continue;
    const v = exp.variants.filter((x) => x.key === key)[0];
    if (v) active.push({ exp, variant: v, forced: false });
  }

  // Only worth hiding while the page is still being parsed – after a late consent we would blank a visible page.
  if (document.readyState === "loading" && active.some((a) => !a.forced && a.exp.hideUntilApplied)) hide();

  for (const a of active) {
    try {
      applyCss(a.exp.key, a.variant.css);
    } catch (err) {
      a.failed = err;
    }
  }

  onReady(() => {
    try {
      for (const a of active) {
        if (a.failed) continue;
        try {
          applyJs(a.variant.js);
        } catch (err) {
          a.failed = err;
        }
      }
    } finally {
      reveal();
    }

    const pairs: Pair[] = [];
    for (const a of active) {
      if (a.failed) {
        removeCss(a.exp.key);
        reportError(a.exp.key, a.variant.key, a.failed);
        continue;
      }
      if (a.forced) continue;
      pairs.push({ e: a.exp.key, v: a.variant.key });
      scheduleExposure(a, vid, shab.customerId, ctx.device);
    }

    const value = buildAbValue(pairs);
    syncCartAttribute(value);
    injectHiddenInputs(value);
    linkCustomer(vid, shab.customerId);
  });
}

function removeCss(key: string): void {
  try {
    const el = document.querySelector(`style[data-shab="${key}"]`);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch {
    /* ignore */
  }
}

/** 4.5: once per experiment per visitor, after apply; `visible` trigger waits for the selector in the viewport. */
function scheduleExposure(a: Active, vid: string, cid: number | null, dev: ExposurePayload["dev"]): void {
  const key = EXP_MARKER + a.exp.key;
  if (ls.get(key)) return;
  const send = () => {
    const payload: ExposurePayload = {
      v: 1,
      e: a.exp.key,
      var: a.variant.key,
      vid,
      cid,
      url: location.pathname + location.search,
      dev,
      ref: document.referrer || "",
      utm: utm(),
      t: Math.floor(Date.now() / 1000),
    };
    post("/e", payload).then((ok) => {
      if (ok) ls.set(key, String(payload.t));
    });
    announce(payload);
  };
  const trigger = a.exp.trigger;
  if (!trigger || trigger.type !== "visible" || !trigger.selector) {
    send();
    return;
  }
  const el = document.querySelector(trigger.selector);
  if (!el) return; // never became visible on this page → nothing to count
  if (typeof IntersectionObserver !== "function") {
    send();
    return;
  }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      io.disconnect();
      send();
    }
  });
  io.observe(el);
}

/** 4.5 login link: once per session, marker only on 2xx. */
function linkCustomer(vid: string, cid: number | null): void {
  if (!cid || ss.get(LINK_MARKER)) return;
  post("/link", { v: 1, vid, cid }).then((ok) => {
    if (ok) ss.set(LINK_MARKER, "1");
  });
}

try {
  main();
} catch {
  reveal();
}
