// Variant application. CSS: <style> in <head> right away. JS: `new Function` in try/catch once the DOM is there.
// "Applied" = the pass threw nothing (null js/css = nothing to do = applied). A throwing JS means not applied.
export function applyCss(key: string, css: string | null): void {
  if (!css) return;
  const el = document.createElement("style");
  el.setAttribute("data-shab", key);
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
}

/** Throws when the variant code throws – the caller decides what that means. */
export function applyJs(js: string | null): void {
  if (!js) return;
  new Function(js)();
}

const HIDE_MS = 300;
let hidden = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function hide(): void {
  if (hidden) return;
  try {
    document.documentElement.style.opacity = "0";
    hidden = true;
    timer = setTimeout(reveal, HIDE_MS);
  } catch {
    /* ignore */
  }
}

export function reveal(): void {
  if (!hidden) return;
  hidden = false;
  if (timer) clearTimeout(timer);
  try {
    document.documentElement.style.opacity = "";
  } catch {
    /* ignore */
  }
}
