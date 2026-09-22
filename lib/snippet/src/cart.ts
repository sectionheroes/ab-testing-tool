// Contract 4.1: cart attribute `_ab` via /cart/update.js whenever value or cart token changed since the last set,
// plus a hidden `properties[_ab]` input in every add-to-cart form (Buy Now / Shop Pay path).
import { getCookie, ls } from "./env";

export const CART_MARKER = "_shab_cart";
export const AB_KEY = "_ab";

export function cartToken(): string {
  return getCookie("cart") || "";
}

function marker(): { t: string; v: string } | null {
  try {
    const raw = ls.get(CART_MARKER);
    return raw ? (JSON.parse(raw) as { t: string; v: string }) : null;
  } catch {
    return null;
  }
}

/** value "" clears the attribute when a marker says one was set before (experiment paused). */
export function syncCartAttribute(value: string): Promise<void> {
  const t = cartToken();
  const m = marker();
  if (m && m.t === t && m.v === value) return Promise.resolve();
  if (!m && value === "") return Promise.resolve();
  try {
    return fetch("/cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ attributes: { [AB_KEY]: value } }),
    })
      .then((r) => {
        if (r.ok) ls.set(CART_MARKER, JSON.stringify({ t: cartToken() || t, v: value }));
      })
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

const INPUT_NAME = `properties[${AB_KEY}]`;

function inject(form: Element, value: string): void {
  let input = form.querySelector<HTMLInputElement>(`input[name="${INPUT_NAME}"]`);
  if (!value) {
    if (input && input.getAttribute("data-shab") !== null) input.remove();
    return;
  }
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = INPUT_NAME;
    input.setAttribute("data-shab", "");
    form.appendChild(input);
  }
  input.value = value;
}

export function injectHiddenInputs(value: string): void {
  const all = () => document.querySelectorAll('form[action*="/cart/add"]').forEach((f) => inject(f, value));
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
