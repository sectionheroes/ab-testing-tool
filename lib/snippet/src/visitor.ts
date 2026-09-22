// Contract 4.4 as amended by ADR-0028 (option D): cookie → localStorage → new UUID v4; both rewritten on every load.
import { getCookie, ls, setCookie, uuid } from "./env";

export const VID_KEY = "_shab_vid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getVisitorId(): string {
  const fromCookie = getCookie(VID_KEY);
  const fromLs = ls.get(VID_KEY);
  const id = (fromCookie && UUID_RE.test(fromCookie) && fromCookie) || (fromLs && UUID_RE.test(fromLs) && fromLs) || uuid();
  setCookie(VID_KEY, id, 365);
  ls.set(VID_KEY, id);
  return id;
}
