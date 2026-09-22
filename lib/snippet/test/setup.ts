// Node ≥ 22 ships an experimental `globalThis.localStorage` getter (undefined without --localstorage-file) that keeps
// vitest's jsdom environment from installing the real one. Replace it with jsdom's Storage for DOM tests.
import { JSDOM } from "jsdom";

if (typeof window !== "undefined" && !window.localStorage) {
  const dom = new JSDOM("", { url: "https://shop.test/" });
  Object.defineProperty(globalThis, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
}
