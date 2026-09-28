// Contract 4.1: cart attribute `_ab` via /cart/update.js whenever value or cart token changed since the last set,
// plus a hidden `properties[_ab]` input in every add-to-cart form (Buy Now / Shop Pay path).
//
// Contract 4.1b adds `_ab_v` = the visitorId, through the same path and under the same condition: the same
// /cart/update.js call, the same marker, the same hidden-input pass. No second request and no second condition – the
// marker simply remembers both values, because "the value changed" now means the payload we write changed. `_ab_v`
// never carries the variant; that stays in `_ab`, whose format is untouched.
//
// `_ab_v` rides along with `_ab`: a visitor who is in no experiment gets neither. Writing the visitor id alone would
// mean a POST /cart/update.js for every visitor of the shop, which buys nothing – there would be no attribution to
// bind it to.
import { getCookie, ls } from "./env";

export const CART_MARKER = "_shab_cart";
export const AB_KEY = "_ab";
export const AB_VID_KEY = "_ab_v";

export function cartToken(): string {
  return getCookie("cart") || "";
}

/** `{ t: cartToken, v: _ab value, i: _ab_v value }`. A marker written before WP4.1 has no `i` and forces one rewrite. */
function marker(): { t: string; v: string; i?: string } | null {
  try {
    const raw = ls.get(CART_MARKER);
    return raw ? (JSON.parse(raw) as { t: string; v: string; i?: string }) : null;
  } catch {
    return null;
  }
}

/** value "" clears both attributes when a marker says one was set before (experiment paused). */
export function syncCartAttribute(value: string, visitorId: string): Promise<void> {
  const vid = value ? visitorId : "";
  const t = cartToken();
  const m = marker();
  if (m && m.t === t && m.v === value && m.i === vid) return Promise.resolve();
  if (!m && value === "") return Promise.resolve();
  try {
    return fetch("/cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ attributes: { [AB_KEY]: value, [AB_VID_KEY]: vid } }),
    })
      .then((r) => {
        if (r.ok) ls.set(CART_MARKER, JSON.stringify({ t: cartToken() || t, v: value, i: vid }));
      })
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

const inputName = (key: string) => `properties[${key}]`;

function inject(form: Element, key: string, value: string): void {
  const name = inputName(key);
  let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!value) {
    if (input && input.getAttribute("data-shab") !== null) input.remove();
    return;
  }
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.setAttribute("data-shab", "");
    form.appendChild(input);
  }
  input.value = value;
}

/** Both keys in the same pass over the same forms – one MutationObserver, one walk (4.1 and 4.1b). */
export function injectHiddenInputs(value: string, visitorId: string): void {
  const vid = value ? visitorId : "";
  const all = () =>
    document.querySelectorAll('form[action*="/cart/add"]').forEach((f) => {
      inject(f, AB_KEY, value);
      inject(f, AB_VID_KEY, vid);
    });
  all();
  if (typeof MutationObserver !== "function") return;
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.addedNodes.length) {
        all();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
