/**
 * Reference tests for the device heuristic (WP4.1). The user-agent strings below are real, copied from devices and
 * from Shopify/Apple documentation of the iPadOS change – not invented, because the whole point of the exercise is
 * that iPadOS 13+ sends a string that is indistinguishable from macOS.
 *
 * `maxTouchPoints` is the second argument, which is what the iPad case turns on: a Mac reports 0, an iPad reports 5.
 * A Windows touch laptop also reports touch points and must stay `desktop` – that case is in here on purpose.
 */
import { describe, expect, it } from "vitest";
import { device } from "../src/env";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  // "Request Mobile Website", and every iPad before iPadOS 13: the string still says iPad.
  ipadMobileMode:
    "Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ default ("Request Desktop Website" is on by default): byte-for-byte a Mac Safari UA.
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  // Android tablets drop the "Mobile" token – that is the only difference from the phone string.
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36",
  firefoxAndroidTablet: "Mozilla/5.0 (Android 13; Tablet; rv:127.0) Gecko/127.0 Firefox/127.0",
};

describe("device() – reference user agents", () => {
  const cases: [keyof typeof UA, number, "mobile" | "tablet" | "desktop"][] = [
    ["iphone", 5, "mobile"],
    ["iphoneChrome", 5, "mobile"],
    ["ipadMobileMode", 5, "tablet"],
    ["ipadDesktopMode", 5, "tablet"],
    ["androidPhone", 5, "mobile"],
    ["androidTablet", 5, "tablet"],
    ["firefoxAndroidTablet", 5, "tablet"],
    ["macSafari", 0, "desktop"],
    ["macChrome", 0, "desktop"],
    ["windowsChrome", 0, "desktop"],
  ];
  for (const [name, touch, expected] of cases) {
    it(`${name} (maxTouchPoints ${touch}) → ${expected}`, () => {
      expect(device(UA[name], touch)).toBe(expected);
    });
  }
});

describe("the iPadOS fix (WP4.1)", () => {
  it("separates an iPad in desktop mode from a Mac purely by maxTouchPoints", () => {
    // Same string. Only the touch points differ, and that is the whole signal that is left.
    expect(UA.ipadDesktopMode).toBe(UA.macSafari);
    expect(device(UA.ipadDesktopMode, 5)).toBe("tablet");
    expect(device(UA.macSafari, 0)).toBe("desktop");
  });

  it("would have called that iPad a desktop without the touch check – the bug this fixes", () => {
    expect(device(UA.ipadDesktopMode, 0)).toBe("desktop");
  });

  it("does not generalise to 'touch means tablet': a Windows touch laptop stays desktop", () => {
    expect(device(UA.windowsChrome, 10)).toBe("desktop");
  });

  it("needs more than one touch point – a single-touch Mac trackpad report is not an iPad", () => {
    expect(device(UA.macSafari, 1)).toBe("desktop");
  });

  it("leaves the iPhone and Android paths untouched, whatever the touch count says", () => {
    expect(device(UA.iphone, 0)).toBe("mobile");
    expect(device(UA.androidPhone, 0)).toBe("mobile");
    expect(device(UA.ipadMobileMode, 0)).toBe("tablet");
  });

  it("falls back to desktop for an unknown user agent", () => {
    expect(device("curl/8.6.0", 0)).toBe("desktop");
    expect(device("", 0)).toBe("desktop");
  });
});
