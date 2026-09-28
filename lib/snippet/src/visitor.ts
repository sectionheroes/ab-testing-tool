// Contract 4.4 as amended by ADR-0028 (option D): cookie → localStorage → new UUID v4; both rewritten on every load.
import { getCookie, ls, setCookie, uuid } from "./env";

export const VID_KEY = "_shab_vid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VisitorId = {
  id: string;
  /**
   * Contract 4.5 field `n` (ADR-0035): neither the cookie nor localStorage held a valid `_shab_vid` at page load, so
   * the id was created in this moment. "new" means new **to the shop**, not new to the test, and it rests on browser
   * storage – incognito, cleared cookies and a different device all count as new.
   */
  isNew: boolean;
};

export function getVisitorId(): VisitorId {
  const fromCookie = getCookie(VID_KEY);
  const fromLs = ls.get(VID_KEY);
  const stored = (fromCookie && UUID_RE.test(fromCookie) && fromCookie) || (fromLs && UUID_RE.test(fromLs) && fromLs) || null;
  const id = stored || uuid();
  setCookie(VID_KEY, id, 365);
  ls.set(VID_KEY, id);
  return { id, isNew: stored === null };
}
