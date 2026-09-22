// Contract 4.4: `?ab_force=key:variant[,key:variant]` for the session, `?ab_force=off` disables everything.
import { ss } from "./env";

export const FORCE_KEY = "_shab_force";
export type Force = "off" | Record<string, string> | null;

export function parseForce(raw: string | null): Force {
  if (!raw) return null;
  if (raw === "off") return "off";
  const out: Record<string, string> = {};
  let any = false;
  raw.split(",").forEach((pair) => {
    const m = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(pair.trim());
    if (m) {
      out[m[1]] = m[2];
      any = true;
    }
  });
  return any ? out : null;
}

function fromSearch(search: string): string | null {
  const m = /[?&]ab_force=([^&#]*)/.exec(search);
  return m ? decodeURIComponent(m[1]) : null;
}

/** URL wins and is persisted for the session; otherwise the session value. */
export function resolveForce(search: string): Force {
  const url = fromSearch(search);
  if (url !== null) {
    ss.set(FORCE_KEY, url);
    return parseForce(url);
  }
  return parseForce(ss.get(FORCE_KEY));
}
