// Transport for the app proxy (contract 4.5): fetch + keepalive, never sendBeacon. Resolves true only on 2xx.
import type { Device } from "./types";

export const PROXY = "/apps/sh-ab";

export function post(path: string, body: unknown): Promise<boolean> {
  try {
    return fetch(PROXY + path, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export type ExposurePayload = {
  v: 1;
  e: string;
  var: string;
  vid: string;
  cid: number | null;
  url: string;
  dev: Device;
  ref: string;
  utm: Record<string, string> | null;
  t: number;
};

export function reportError(e: string, variant: string, err: unknown): void {
  const error = err as { message?: string; stack?: string } | null;
  const stack = error && typeof error.stack === "string" ? error.stack.slice(0, 500) : "";
  post("/err", { v: 1, e, var: variant, msg: error && error.message ? String(error.message) : String(err), stack, url: location.pathname + location.search });
}

/** Side channels for Custom Pixels / GTM – fire and forget. */
export function announce(payload: ExposurePayload): void {
  try {
    const s = window.Shopify;
    if (s && s.analytics && typeof s.analytics.publish === "function") s.analytics.publish("shab_exposure", payload);
  } catch {
    /* ignore */
  }
  try {
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: "shab_exposure", experiment: payload.e, variant: payload.var, vid: payload.vid });
  } catch {
    /* ignore */
  }
}
