// Contract 4.1 – `_ab` = "<experiment_key>:<variant_key>[,...]", sorted by experiment key, keys `^[a-z0-9-]+$`.
const KEY_RE = /^[a-z0-9-]+$/;

export type Pair = { e: string; v: string };

export function buildAbValue(pairs: Pair[]): string {
  return pairs
    .filter((p) => KEY_RE.test(p.e) && KEY_RE.test(p.v))
    .sort((a, b) => (a.e < b.e ? -1 : a.e > b.e ? 1 : 0))
    .map((p) => `${p.e}:${p.v}`)
    .join(",");
}
