// Contract 4.2 targeting, Phase 1 keys: `url` and `device`. Unknown keys are ignored (schema is additive).
// `exact` compares the pathname only (tracking params must not break it); `contains`/`regex` see pathname + search
// so query-based targeting stays possible.
import type { Device, Experiment, UrlRule } from "./types";

export function matchesUrl(rule: UrlRule | undefined, pathname: string, search: string): boolean {
  if (!rule || typeof rule.value !== "string") return true;
  const full = pathname + search;
  if (rule.match === "exact") return pathname === rule.value || pathname.replace(/\/$/, "") === rule.value.replace(/\/$/, "");
  if (rule.match === "contains") return full.indexOf(rule.value) !== -1;
  if (rule.match === "regex") {
    try {
      return new RegExp(rule.value).test(full);
    } catch {
      return false;
    }
  }
  return true;
}

export function matchesDevice(list: Device[] | undefined, device: Device): boolean {
  if (!list || !Array.isArray(list) || list.length === 0) return true;
  return list.indexOf(device) !== -1;
}

export function matches(exp: Experiment, ctx: { pathname: string; search: string; device: Device }): boolean {
  const t = exp.targeting || {};
  return matchesUrl(t.url, ctx.pathname, ctx.search) && matchesDevice(t.device, ctx.device);
}
