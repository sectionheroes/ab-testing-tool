// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { post } from "../src/beacon";
import { syncCartAttribute, CART_MARKER } from "../src/cart";

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

describe("syncCartAttribute (4.1)", () => {
  it("posts when value or token differs from the marker, marker only on ok", async () => {
    document.cookie = "cart=tok1; Path=/";
    fetchMock.mockResolvedValue({ ok: false });
    await syncCartAttribute("demo-test:b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ attributes: { _ab: "demo-test:b" } });
    expect(window.localStorage.getItem(CART_MARKER)).toBe(null);

    fetchMock.mockResolvedValue({ ok: true });
    await syncCartAttribute("demo-test:b");
    expect(JSON.parse(window.localStorage.getItem(CART_MARKER)!)).toEqual({ t: "tok1", v: "demo-test:b" });

    await syncCartAttribute("demo-test:b"); // same value, same token → nothing
    expect(fetchMock).toHaveBeenCalledTimes(2);

    document.cookie = "cart=tok2; Path=/"; // new cart after checkout → set again
    await syncCartAttribute("demo-test:b");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("never sends an empty value when nothing was set before", async () => {
    await syncCartAttribute("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
