// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { post } from "../src/beacon";
import { injectHiddenInputs, syncCartAttribute, CART_MARKER } from "../src/cart";

const fetchMock = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("post → exposure marker rule (4.5)", () => {
  const marker = "_shab_exp:demo-test";
  const attempt = async () => {
    const ok = await post("/e", { v: 1 });
    if (ok) window.localStorage.setItem(marker, "1");
    return ok;
  };
  it("204 → marker", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    expect(await attempt()).toBe(true);
    expect(window.localStorage.getItem(marker)).toBe("1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/apps/sh-ab/e");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
  });
  it("500 → no marker, resend on next load", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await attempt()).toBe(false);
    expect(window.localStorage.getItem(marker)).toBe(null);
  });
  it("network error → no marker, no throw", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await attempt()).toBe(false);
    expect(window.localStorage.getItem(marker)).toBe(null);
  });
});

const VID = "44f15d3c-6f0a-4b1e-9f7c-2a1b8e0d5c31";

describe("syncCartAttribute (4.1 + 4.1b)", () => {
  it("posts when value or token differs from the marker, marker only on ok", async () => {
    document.cookie = "cart=tok1; Path=/";
    fetchMock.mockResolvedValue({ ok: false });
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ attributes: { _ab: "demo-test:b", _ab_v: VID } });
    expect(window.localStorage.getItem(CART_MARKER)).toBe(null);

    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    expect(JSON.parse(window.localStorage.getItem(CART_MARKER)!)).toEqual({ t: "tok1", v: "demo-test:b", i: VID });

    await syncCartAttribute("demo-test:b", VID); // same value, same token → nothing
    expect(fetchMock).toHaveBeenCalledTimes(2);

    document.cookie = "cart=tok2; Path=/"; // new cart after checkout → set again
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends both keys in ONE request – no second call for `_ab_v` (4.1b)", async () => {
    document.cookie = "cart=tok1; Path=/";
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/cart/update.js");
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body).attributes)).toEqual(["_ab", "_ab_v"]);
  });

  it("carries the visitor id unchanged and untruncated (4.1b)", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).attributes._ab_v).toBe(VID);
  });

  it("`_ab_v` never carries the variant – that stays in `_ab` (4.1b)", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b,other:a", VID);
    const { attributes } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(attributes._ab).toBe("demo-test:b,other:a");
    expect(attributes._ab_v).toBe(VID);
    expect(attributes._ab_v).not.toContain(":");
  });

  it("a changed visitor id alone is enough to rewrite – a stale id would bind the order to the wrong visitor", async () => {
    document.cookie = "cart=tok1; Path=/";
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await syncCartAttribute("demo-test:b", "99999999-9999-4999-8999-999999999999");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears both keys when the value goes empty after something was set", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    await syncCartAttribute("", VID);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ attributes: { _ab: "", _ab_v: "" } });
  });

  it("never sends an empty value when nothing was set before – a visitor in no experiment gets no request at all", async () => {
    await syncCartAttribute("", VID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rewrites once for a marker written before `_ab_v` existed", async () => {
    document.cookie = "cart=tok1; Path=/";
    window.localStorage.setItem(CART_MARKER, JSON.stringify({ t: "tok1", v: "demo-test:b" }));
    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await syncCartAttribute("demo-test:b", VID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("injectHiddenInputs (4.1 + 4.1b)", () => {
  it("puts both properties into every add-to-cart form", async () => {
    document.body.innerHTML = `
      <form action="/cart/add"></form>
      <form action="/en/cart/add" method="post"></form>
      <form action="/search"></form>`;
    injectHiddenInputs("demo-test:b", VID);
    const ab = document.querySelectorAll<HTMLInputElement>('input[name="properties[_ab]"]');
    const vid = document.querySelectorAll<HTMLInputElement>('input[name="properties[_ab_v]"]');
    expect(ab).toHaveLength(2);
    expect(vid).toHaveLength(2);
    expect([...vid].every((i) => i.value === VID && i.type === "hidden")).toBe(true);
    expect(document.querySelector('form[action="/search"] input')).toBeNull();
  });

  it("removes both again when the value goes empty", () => {
    document.body.innerHTML = `<form action="/cart/add"></form>`;
    injectHiddenInputs("demo-test:b", VID);
    injectHiddenInputs("", VID);
    expect(document.querySelector('input[name="properties[_ab]"]')).toBeNull();
    expect(document.querySelector('input[name="properties[_ab_v]"]')).toBeNull();
  });
});
