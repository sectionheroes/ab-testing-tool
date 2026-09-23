import { describe, expect, it } from "vitest";
import { localDayRangeUtc, timezoneOffsetMs } from "./timezone";

const iso = (d: Date) => d.toISOString();

describe("localDayRangeUtc", () => {
  it("maps a normal Berlin day to its UTC interval", () => {
    const r = localDayRangeUtc("2026-09-12", "Europe/Berlin"); // CEST, UTC+2
    expect(iso(r.from)).toBe("2026-09-11T22:00:00.000Z");
    expect(iso(r.to)).toBe("2026-09-12T22:00:00.000Z");
    expect(r.to.getTime() - r.from.getTime()).toBe(24 * 3600_000);
  });

  it("maps a winter Berlin day (UTC+1)", () => {
    const r = localDayRangeUtc("2026-01-15", "Europe/Berlin");
    expect(iso(r.from)).toBe("2026-01-14T23:00:00.000Z");
    expect(iso(r.to)).toBe("2026-01-15T23:00:00.000Z");
  });

  it("gets the 23-hour day right when the clocks go forward", () => {
    // Europe/Berlin springs forward on the last Sunday in March 2026 = 29 March.
    const r = localDayRangeUtc("2026-03-29", "Europe/Berlin");
    expect(iso(r.from)).toBe("2026-03-28T23:00:00.000Z");
    expect(iso(r.to)).toBe("2026-03-29T22:00:00.000Z");
    expect(r.to.getTime() - r.from.getTime()).toBe(23 * 3600_000);
  });

  it("gets the 25-hour day right when the clocks go back", () => {
    // Last Sunday in October 2026 = 25 October.
    const r = localDayRangeUtc("2026-10-25", "Europe/Berlin");
    expect(iso(r.from)).toBe("2026-10-24T22:00:00.000Z");
    expect(iso(r.to)).toBe("2026-10-25T23:00:00.000Z");
    expect(r.to.getTime() - r.from.getTime()).toBe(25 * 3600_000);
  });

  it("handles UTC and a zone west of Greenwich", () => {
    const utc = localDayRangeUtc("2026-06-01", "UTC");
    expect(iso(utc.from)).toBe("2026-06-01T00:00:00.000Z");
    expect(iso(utc.to)).toBe("2026-06-02T00:00:00.000Z");

    const ny = localDayRangeUtc("2026-06-01", "America/New_York"); // EDT, UTC−4
    expect(iso(ny.from)).toBe("2026-06-01T04:00:00.000Z");
    expect(iso(ny.to)).toBe("2026-06-02T04:00:00.000Z");
  });

  it("handles a half-hour offset", () => {
    const r = localDayRangeUtc("2026-06-01", "Asia/Kolkata"); // UTC+5:30
    expect(iso(r.from)).toBe("2026-05-31T18:30:00.000Z");
    expect(iso(r.to)).toBe("2026-06-01T18:30:00.000Z");
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(() => localDayRangeUtc("12.09.2026", "UTC")).toThrow(/YYYY-MM-DD/);
    expect(() => localDayRangeUtc("2026-9-1", "UTC")).toThrow(/YYYY-MM-DD/);
  });

  it("consecutive days tile without gap or overlap", () => {
    const a = localDayRangeUtc("2026-10-24", "Europe/Berlin");
    const b = localDayRangeUtc("2026-10-25", "Europe/Berlin");
    const c = localDayRangeUtc("2026-10-26", "Europe/Berlin");
    expect(iso(a.to)).toBe(iso(b.from));
    expect(iso(b.to)).toBe(iso(c.from));
  });
});

describe("timezoneOffsetMs", () => {
  it("reports the offset in milliseconds, east positive", () => {
    expect(timezoneOffsetMs(new Date("2026-07-01T12:00:00Z"), "Europe/Berlin")).toBe(2 * 3600_000);
    expect(timezoneOffsetMs(new Date("2026-01-01T12:00:00Z"), "Europe/Berlin")).toBe(1 * 3600_000);
    expect(timezoneOffsetMs(new Date("2026-07-01T12:00:00Z"), "UTC")).toBe(0);
    expect(timezoneOffsetMs(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-4 * 3600_000);
  });

  it("survives midnight, where some ICU versions render hour 24", () => {
    expect(timezoneOffsetMs(new Date("2026-06-30T22:00:00Z"), "Europe/Berlin")).toBe(2 * 3600_000);
  });
});
