/**
 * Acceptance screenshots: every dashboard page at 1440 px, in both themes, against the **local** dev server and the
 * **local** database. Each work package puts its set in `docs/screenshots/<wp>/` as the evidence for its acceptance
 * list, and WP5b will want the same harness.
 *
 * It drives the Chrome that is already installed (`puppeteer-core`, so nothing is downloaded) and signs in by minting
 * the dashboard session cookie for a local admin row with the local `SESSION_SECRET`. No password is involved and
 * `requireLocalDatabase` keeps it away from anything but localhost.
 *
 * Run: `pnpm screenshots docs/screenshots/wp5a` (the dev server has to be up: `pnpm dev:dashboard`).
 */
import { mkdirSync } from "node:fs";
import { createCookieSessionStorage } from "react-router";
import { PrismaClient } from "@prisma/client";
import { launch } from "puppeteer-core";
import { requireLocalDatabase } from "./local-only";

requireLocalDatabase("screenshots");

const OUT = process.argv[2] ?? "docs/screenshots/wp5a";
/** Chrome on macOS. Override with CHROME_PATH on another machine. */
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const SHOP = "wunderwunsch-demo.myshopify.com";
/** A shop that has never run a test – `pnpm seed:demo` leaves Knusperliebe empty on purpose. */
const FIRST_TEST_SHOP = "knusperliebe-demo.myshopify.com";

const PAGES: { name: string; path: string; full?: boolean; prepare?: string }[] = [
  { name: "experiments-all-shops", path: `/dashboard/s/all/experiments`, full: true },
  { name: "experiments-one-shop", path: `/dashboard/s/${SHOP}/experiments`, full: true },
  { name: "experiment-form-new", path: `/dashboard/s/${SHOP}/experiments/new`, full: true, prepare: "fill" },
  { name: "experiment-form-shop-select", path: `/dashboard/s/all/experiments/new` },
  { name: "experiment-form-errors", path: `/dashboard/s/${SHOP}/experiments/new`, prepare: "errors" },
  { name: "experiment-form-aov-visible", path: `/dashboard/s/${SHOP}/experiments/new`, prepare: "aov" },
  // Figma state 5: a shop with no earlier test has no baseline and no pace, so the baseline is typed in and the
  // projection stays empty instead of being guessed (ADR-0036).
  { name: "experiment-form-first-test", path: `/dashboard/s/${FIRST_TEST_SHOP}/experiments/new` },
  // Figma state 6: a conversion target this shop's pace cannot reach inside six weeks – the futility warning.
  { name: "experiment-form-futility", path: `/dashboard/s/${SHOP}/experiments/new`, prepare: "futility" },
  { name: "experiment-detail-draft", path: `/dashboard/s/${SHOP}/experiments/navigation-mega-menu`, full: true },
  { name: "experiment-detail-running", path: `/dashboard/s/${SHOP}/experiments/pdp-reviews-above-price`, full: true },
  { name: "experiment-form-edit-running", path: `/dashboard/s/${SHOP}/experiments/pdp-reviews-above-price/edit` },
  { name: "shops", path: "/dashboard/shops", full: true },
  { name: "shop-detail-wp3", path: "__SHOP_DETAIL__", full: false },
  { name: "users", path: "/dashboard/users", full: true },
  { name: "reconciliation", path: `/dashboard/s/${SHOP}/reconciliation`, full: true },
  { name: "styleguide", path: "/dashboard/styleguide", full: true },
];

const PREPARE: Record<string, string> = {
  fill: `
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('input[name="name"]', 'PDP: Reviews above price');
    set('textarea[name="hypothesis"]', 'If we show the star rating above the price, more visitors add to cart, because they see social proof before they see the price.');
    set('input[name="urlValue"]', '/products/');
    set('input[name="variant.1.name"]', 'Reviews above price');
    await new Promise(r => setTimeout(r, 400));
    const js = [...document.querySelectorAll('.cm-content')][0];
    if (js) { js.focus(); document.execCommand('insertText', false, "// Move the star rating above the price\\nconst rating = document.querySelector('.product__rating');\\nconst price  = document.querySelector('.product__price');\\n\\nif (rating && price) {\\n  price.before(rating);\\n  rating.classList.add('shab-rating-top');\\n}"); }
    const css = [...document.querySelectorAll('.cm-content')][1];
    if (css) { css.focus(); document.execCommand('insertText', false, ".shab-rating-top {\\n  margin-bottom: 8px;\\n  font-size: 15px;\\n}"); }
    document.activeElement.blur();
  `,
  errors: `
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('input[name="name"]', 'PDP: Reviews above price');
    document.querySelector('select[name="urlMatch"]').value = 'regex';
    document.querySelector('select[name="urlMatch"]').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    set('input[name="urlValue"]', '^/products/(.*');
    set('input[name="variant.1.weight"]', '40');
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('main form button[type="submit"]').click();
    await new Promise(r => setTimeout(r, 400));
  `,
  futility: `
    const el = document.querySelector('input[name="minConversionsPerArm"]');
    if (!el) throw new Error('futility: the form is not hydrated yet');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2500');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
  `,
  aov: `
    const sel = document.querySelector('select[name="primaryMetric"]');
    if (!sel) throw new Error('no primaryMetric select; page is ' + location.pathname + ' / ' + document.body.innerText.slice(0, 120));
    sel.value = 'AOV';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('input[name="triggerType"][value="visible"]')?.click();
    await new Promise(r => setTimeout(r, 400));
  `,
};

async function sessionCookie() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  await prisma.$disconnect();
  const storage = createCookieSessionStorage<{ userId: string }>({
    cookie: { name: "shab_session", httpOnly: true, sameSite: "lax", path: "/", secure: false, secrets: [process.env.SESSION_SECRET!], maxAge: 2_592_000 },
  });
  const session = await storage.getSession();
  session.set("userId", user.id);
  const header = await storage.commitSession(session);
  return header.split(";")[0].split("=").slice(1).join("=");
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  {
    const prisma = new PrismaClient();
    const shop = await prisma.shop.findUnique({ where: { domain: SHOP } });
    await prisma.$disconnect();
    for (const p of PAGES) if (p.path === "__SHOP_DETAIL__") p.path = `/dashboard/shops/${shop!.id}`;
  }
  const value = await sessionCookie();
  const browser = await launch({
    executablePath: CHROME,
    headless: true,
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
  });

  for (const theme of ["dark", "light"] as const) {
    for (const p of PAGES) {
      // A fresh tab per screenshot. Sharing one across the whole run let state from an earlier page (a prepare step
      // that submits, a pending navigation) bleed into the next one and produced an error page instead of a form.
      const page = await browser.newPage();
      await page.setCookie({ name: "shab_session", value, domain: "localhost", path: "/" });
      await page.evaluateOnNewDocument((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          /* ignore */
        }
      }, theme);
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);

      await page.goto(BASE + p.path, { waitUntil: "networkidle0", timeout: 60_000 });
      await new Promise((r) => setTimeout(r, 700));
      if (p.prepare) {
        // The prepare steps drive React-controlled inputs, so they have to wait for hydration – without this they
        // race the first client render and find nothing.
        await page.waitForFunction("document.querySelector('main form') !== null", { timeout: 30_000 });
        await new Promise((r) => setTimeout(r, 400));
        await page.evaluate(`(async () => { ${PREPARE[p.prepare]} })()`);
      }
      await new Promise((r) => setTimeout(r, 500));
      // A screenshot of the error boundary is worse than no screenshot: it looks like evidence.
      const text = (await page.evaluate("document.body.innerText")) as string;
      if (text.includes("Something went wrong") || text.includes("could not be rendered")) {
        throw new Error(`${p.name} (${theme}) rendered the error boundary:\n${text.slice(0, 300)}`);
      }

      const file = `${OUT}/${p.name}-${theme}.png`;
      await page.screenshot({ path: file as `${string}.png`, fullPage: p.full ?? false });
      console.log(file);
      await page.close();
    }
  }
  await browser.close();
};

main();
