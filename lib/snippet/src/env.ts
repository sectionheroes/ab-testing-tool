// Browser access behind try/catch. Every function here is allowed to fail silently – the page must never notice us.
import type { Device } from "./types";

export const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix/i;

export function isBot(nav: Navigator = navigator): boolean {
  try {
    return nav.webdriver === true || BOT_RE.test(nav.userAgent || "");
  } catch {
    return true;
  }
}

/** localStorage is mandatory (markers, visitor id). Private mode / blocked storage → we do nothing at all. */
export function storageOk(): boolean {
  try {
    const k = "_shab_t";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export const ls = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export const ss = {
  get(k: string): string | null {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      window.sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function setCookie(name: string, value: string, days: number): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

/** `navigator.maxTouchPoints`, 0 when the browser does not report it. Never throws. */
export function touchPoints(nav: Navigator = navigator): number {
  try {
    const n = nav.maxTouchPoints;
    return typeof n === "number" && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Device class of an exposure (contract 4.2 / 4.10). UA heuristic, and therefore fallible – it is the class at
 * exposure time, which is what the report shows.
 *
 * The `Macintosh` + touch rule is the iPadOS fix (WP4.1): since iPadOS 13 an iPad requests desktop sites by default
 * and sends a UA that is byte-for-byte a Mac Safari UA. Nothing in the string distinguishes it; the only signal left
 * is that a Mac reports `maxTouchPoints === 0` and an iPad reports 5. Without this every iPad landed in `desktop`,
 * which is a third of mobile commerce traffic in the wrong bucket.
 *
 * It is deliberately scoped to `Macintosh`: a Windows touch laptop also reports touch points and is genuinely a
 * desktop, so the rule must not generalise to "touch means tablet".
 */
export function device(ua: string = navigator.userAgent, maxTouchPoints: number = touchPoints()): Device {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return "tablet";
  return "desktop";
}

export function utm(search: string = location.search): Record<string, string> | null {
  const out: Record<string, string> = {};
  let any = false;
  search
    .replace(/^\?/, "")
    .split("&")
    .forEach((p) => {
      const i = p.indexOf("=");
      const k = decodeURIComponent(i < 0 ? p : p.slice(0, i));
      if (k.indexOf("utm_") === 0 && k.length > 4) {
        out[k.slice(4)] = decodeURIComponent((i < 0 ? "" : p.slice(i + 1)).replace(/\+/g, " "));
        any = true;
      }
    });
  return any ? out : null;
}

export function uuid(): string {
  try {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const b = new Uint8Array(16);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

export function onReady(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
}
