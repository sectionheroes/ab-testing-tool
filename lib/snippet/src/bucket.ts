// Contract 4.4 – never change. input = `${visitorId}:${experimentKey}:${salt}`, FNV-1a 32-bit, bucket = hash % 10000.
import type { Experiment } from "./types";

export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Variant key, or null when the visitor is outside the allocation. */
export function bucket(visitorId: string, exp: Pick<Experiment, "key" | "salt" | "allocation" | "variants">): string | null {
  const b = fnv1a32(`${visitorId}:${exp.key}:${exp.salt}`) % 10000;
  const cut = exp.allocation * 10000;
  if (b >= cut) return null;
  const point = b / cut;
  let cum = 0;
  for (const v of exp.variants) {
    cum += v.weight;
    if (cum >= point) return v.key;
  }
  return exp.variants.length ? exp.variants[exp.variants.length - 1].key : null;
}
