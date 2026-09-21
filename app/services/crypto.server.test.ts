import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, safeEqual } from "./crypto.server";

const key = randomBytes(32);

describe("crypto.server", () => {
  it("round-trips", () => {
    const enc = encrypt("shpat_secret", key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("shpat_secret");
    expect(decrypt(enc, key)).toBe("shpat_secret");
  });

  it("uses a fresh iv per call", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, ct] = encrypt("hello", key).split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
  });

  it("rejects a wrong key", () => {
    expect(() => decrypt(encrypt("hello", key), randomBytes(32))).toThrow();
  });

  it("reads hex and base64 keys from env", () => {
    process.env.TOKEN_ENCRYPTION_KEY = key.toString("hex");
    expect(decrypt(encrypt("a"))).toBe("a");
    process.env.TOKEN_ENCRYPTION_KEY = key.toString("base64");
    expect(decrypt(encrypt("b"))).toBe("b");
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encrypt("c")).toThrow(/32 bytes/);
  });

  it("safeEqual compares without length leaks", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
