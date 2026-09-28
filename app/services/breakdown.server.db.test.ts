/**
 * `breakdown()` – contracts 4.9 (time series) and 4.10 (segment dimensions) against a real Postgres.
 *
 * The load-bearing assertion in here is the same one for every dimension: **the rows sum to the numbers `evaluate()`
 * reports.** A segment table that does not add up to the headline is worse than no segment table, and for three
 * dimensions plus a day axis there is no way to see that by reading the SQL.
 */
import { describe, expect, it } from "vitest";
import { addExposure, addOrder, inRollback, seedExperiment, type SeededExperiment, type Tx } from "../../test/db/fixture";
import { breakdown, computeStatsFor, loadExperimentForStats, type BreakdownDimension, type BreakdownRow } from "./stats.server";

const NOW = new Date("2026-10-20T00:00:00Z");
const vid = (n: number) => `44f15d3c-6f0a-4b1e-9f7c-${String(n).padStart(12, "0")}`;

const totals = (rows: BreakdownRow[], variantKey?: string) => {
  const r = variantKey ? rows.filter((x) => x.variantKey === variantKey) : rows;
  return {
    visitors: r.reduce((s, x) => s + x.visitors, 0),
    converters: r.reduce((s, x) => s + x.converters, 0),
    orders: r.reduce((s, x) => s + x.orders, 0),
    revenue: Math.round(r.reduce((s, x) => s + x.revenue, 0) * 100) / 100,
  };
};

/**
 * A fixture with every dimension populated at once: two arms, four devices' worth of exposures, new and returning and
 * unknown visitor types, several channels, and both the `_ab_v` path and the unlinkable fallback.
 */
async function seedMixed(tx: Tx, over: Parameters<typeof seedExperiment>[1] = {}) {
  const f = await seedExperiment(tx, {
    timezone: "Europe/Berlin",
    startedAt: new Date("2026-10-01T00:00:00Z"),
    domain: "kunde.myshopify.com",
    ...over,
  });
  type Spec = {
    variant: "a" | "b";
    n: number;
    device: string;
    isNewVisitor: boolean | null;
    referrer: string | null;
    utm: Record<string, string> | null;
    day: string;
    order?: number;
  };
  const specs: Spec[] = [
    { variant: "a", n: 1, device: "mobile", isNewVisitor: true, referrer: "https://l.instagram.com/", utm: { source: "ig", medium: "paid" }, day: "2026-10-02", order: 100 },
    { variant: "a", n: 2, device: "mobile", isNewVisitor: true, referrer: "https://l.instagram.com/", utm: null, day: "2026-10-02" },
    { variant: "a", n: 3, device: "desktop", isNewVisitor: false, referrer: "https://www.google.com/", utm: null, day: "2026-10-03", order: 50 },
    { variant: "a", n: 4, device: "tablet", isNewVisitor: null, referrer: null, utm: null, day: "2026-10-03" },
    { variant: "a", n: 5, device: "desktop", isNewVisitor: false, referrer: null, utm: { source: "klaviyo", medium: "email" }, day: "2026-10-04", order: 25 },
    { variant: "b", n: 6, device: "mobile", isNewVisitor: true, referrer: "https://www.google.com/", utm: { source: "google", medium: "cpc" }, day: "2026-10-02", order: 70 },
    { variant: "b", n: 7, device: "desktop", isNewVisitor: false, referrer: "https://blog.example.com/", utm: null, day: "2026-10-03" },
    { variant: "b", n: 8, device: "tablet", isNewVisitor: true, referrer: null, utm: null, day: "2026-10-04", order: 30 },
    { variant: "b", n: 9, device: "mobile", isNewVisitor: null, referrer: "https://www.idealo.de/x", utm: null, day: "2026-10-04" },
  ];
  for (const s of specs) {
    await addExposure(tx, f, {
      variant: s.variant,
      visitorId: vid(s.n),
      at: `${s.day}T10:00:00Z`,
      device: s.device,
      isNewVisitor: s.isNewVisitor,
      referrer: s.referrer,
      utm: s.utm,
    });
    // Orders are deliberately placed on LATER days than the exposure: 4.9 dates a conversion by the exposure day.
    if (s.order) await addOrder(tx, f, { variant: s.variant, at: "2026-10-08T12:00:00Z", total: s.order, visitorId: vid(s.n) });
  }
  // Two unlinkable orders (no `_ab_v`, no customer) – they must show up as `unknown` / `null` and still be in the sums.
  await addOrder(tx, f, { variant: "a", at: "2026-10-09T12:00:00Z", total: 11 });
  await addOrder(tx, f, { variant: "b", at: "2026-10-09T12:00:00Z", total: 22 });
  return f;
}

const load = async (tx: Tx, f: SeededExperiment) => (await loadExperimentForStats(f.experiment.id, tx))!;

describe("acceptance: every dimension sums to evaluate()", () => {
  const dimensions: BreakdownDimension[] = ["day", "device", "visitorType", "channel"];

  for (const dimension of dimensions) {
    it(`${dimension} adds up to the totals, for the experiment and per arm`, async () => {
      const { stats, rows } = await inRollback(async (tx) => {
        const f = await seedMixed(tx);
        const experiment = await load(tx, f);
        return {
          stats: await computeStatsFor(experiment, { now: NOW, db: tx }),
          rows: (await breakdown(experiment, dimension, { now: NOW, db: tx })).rows,
        };
      });

      const expected = {
        visitors: stats.variants.reduce((s, v) => s + v.visitors, 0),
        orders: stats.variants.reduce((s, v) => s + v.orders, 0),
        revenue: Math.round(stats.variants.reduce((s, v) => s + v.revenue, 0) * 100) / 100,
      };
      expect(totals(rows)).toMatchObject(expected);

      for (const variant of stats.variants) {
        expect(totals(rows, variant.key)).toMatchObject({
          visitors: variant.visitors,
          orders: variant.orders,
          revenue: variant.revenue,
        });
      }
    });

    it(`${dimension} × day adds up to the same totals`, async () => {
      const { stats, rows } = await inRollback(async (tx) => {
        const f = await seedMixed(tx);
        const experiment = await load(tx, f);
        return {
          stats: await computeStatsFor(experiment, { now: NOW, db: tx }),
          rows: (await breakdown(experiment, dimension, { byDay: true, now: NOW, db: tx })).rows,
        };
      });
      for (const variant of stats.variants) {
        expect(totals(rows, variant.key)).toMatchObject({
          visitors: variant.visitors,
          orders: variant.orders,
          revenue: variant.revenue,
        });
      }
    });
  }

  it("the converter count per dimension matches evaluate(), unlinkable identities included", async () => {
    const { stats, byDimension } = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      const experiment = await load(tx, f);
      const byDimension: Record<string, BreakdownRow[]> = {};
      for (const d of ["day", "device", "visitorType", "channel"] as BreakdownDimension[]) {
        byDimension[d] = (await breakdown(experiment, d, { now: NOW, db: tx })).rows;
      }
      return { stats: await computeStatsFor(experiment, { now: NOW, db: tx }), byDimension };
    });
    for (const [dimension, rows] of Object.entries(byDimension)) {
      for (const variant of stats.variants) {
        expect(totals(rows, variant.key).converters, `${dimension} / ${variant.key}`).toBe(variant.converters);
      }
    }
  });
});

describe("device (4.10)", () => {
  it("matches the byDevice block of evaluate() bucket for bucket, `unknown` included", async () => {
    const { stats, rows } = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      const experiment = await load(tx, f);
      return {
        stats: await computeStatsFor(experiment, { now: NOW, db: tx }),
        rows: (await breakdown(experiment, "device", { now: NOW, db: tx })).rows,
      };
    });
    for (const variant of stats.variants) {
      for (const bucket of ["mobile", "desktop", "tablet", "unknown"] as const) {
        const row = rows.find((r) => r.variantKey === variant.key && r.segment === bucket);
        const expected = variant.byDevice[bucket];
        expect(row?.visitors ?? 0, `${variant.key}/${bucket} visitors`).toBe(expected.visitors);
        expect(row?.orders ?? 0, `${variant.key}/${bucket} orders`).toBe(expected.orders);
        expect(row?.converters ?? 0, `${variant.key}/${bucket} converters`).toBe(expected.converters);
        expect(row?.revenue ?? 0, `${variant.key}/${bucket} revenue`).toBe(expected.revenue);
      }
    }
  });

  it("puts the unlinkable orders in `unknown` and never a visitor there", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      return (await breakdown(await load(tx, f), "device", { now: NOW, db: tx })).rows;
    });
    const unknown = rows.filter((r) => r.segment === "unknown");
    expect(unknown).toHaveLength(2); // one per arm
    expect(unknown.every((r) => r.visitors === 0)).toBe(true);
    expect(totals(unknown).orders).toBe(2);
    expect(totals(unknown).revenue).toBe(33);
  });
});

describe("visitorType (4.10, ADR-0035)", () => {
  it("splits into new, returning and unknown, and unknown means the snippet sent no `n`", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      return (await breakdown(await load(tx, f), "visitorType", { now: NOW, db: tx })).rows;
    });
    const seg = (s: string) => totals(rows.filter((r) => r.segment === s));
    expect(seg("new").visitors).toBe(4); // vid 1, 2, 6, 8
    expect(seg("returning").visitors).toBe(3); // vid 3, 5, 7
    expect(seg("unknown").visitors).toBe(2); // vid 4, 9 – isNewVisitor null
    expect(rows.every((r) => ["new", "returning", "unknown"].includes(r.segment))).toBe(true);
  });

  it("an exposure with isNewVisitor = null lands in unknown, not in returning", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), isNewVisitor: null });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(2), isNewVisitor: false });
      return (await breakdown(await load(tx, f), "visitorType", { now: NOW, db: tx })).rows;
    });
    expect(rows.find((r) => r.segment === "unknown")?.visitors).toBe(1);
    expect(rows.find((r) => r.segment === "returning")?.visitors).toBe(1);
    expect(rows.find((r) => r.segment === "new")).toBeUndefined();
  });
});

describe("channel (4.10)", () => {
  it("classifies the exposures into the right groups", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      return (await breakdown(await load(tx, f), "channel", { now: NOW, db: tx })).rows;
    });
    const seg = (s: string) => totals(rows.filter((r) => r.segment === s)).visitors;
    expect(seg("paid_social")).toBe(1); // vid 1 – instagram + medium paid
    expect(seg("organic_social")).toBe(1); // vid 2 – instagram, no paid medium
    expect(seg("organic_search")).toBe(1); // vid 3 – google referrer
    expect(seg("direct")).toBe(2); // vid 4, 8 – no referrer, no utm
    expect(seg("email")).toBe(1); // vid 5 – klaviyo
    expect(seg("paid_search")).toBe(1); // vid 6 – google + cpc
    expect(seg("referral")).toBe(1); // vid 7 – a blog
    expect(seg("organic_shopping")).toBe(1); // vid 9 – idealo
  });

  it("gives an unlinkable order `unknown`, which is not the same as `unassigned`", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      return (await breakdown(await load(tx, f), "channel", { now: NOW, db: tx })).rows;
    });
    const unknown = rows.filter((r) => r.segment === "unknown");
    expect(totals(unknown)).toMatchObject({ visitors: 0, orders: 2, revenue: 33 });
    expect(rows.some((r) => r.segment === "unassigned")).toBe(false);
  });

  it("treats a referrer from the shop itself as direct, not as a referral", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, {
        timezone: "Europe/Berlin",
        startedAt: new Date("2026-10-01T00:00:00Z"),
        domain: "kunde.myshopify.com",
      });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), referrer: "https://kunde.myshopify.com/collections/all" });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(2), referrer: "https://blog.example.com/" });
      return (await breakdown(await load(tx, f), "channel", { now: NOW, db: tx })).rows;
    });
    expect(rows.find((r) => r.segment === "direct")?.visitors).toBe(1);
    expect(rows.find((r) => r.segment === "referral")?.visitors).toBe(1);
  });

  it("groups by referrer host, not by full URL – different paths on one host are one segment row", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      for (let i = 1; i <= 3; i++) {
        await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(i), referrer: `https://www.google.com/search?q=thing-${i}` });
      }
      return (await breakdown(await load(tx, f), "channel", { now: NOW, db: tx })).rows;
    });
    expect(rows.filter((r) => r.segment === "organic_search")).toHaveLength(1);
    expect(rows[0].visitors).toBe(3);
  });
});

describe("day (4.9)", () => {
  it("dates a conversion by the visitor's EXPOSURE day, not by the order day", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T10:00:00Z", visitorId: vid(1) });
      // Bought six days later. 4.9 puts the conversion and its revenue on 2 October all the same.
      await addOrder(tx, f, { at: "2026-10-08T10:00:00Z", total: 100, visitorId: vid(1) });
      return (await breakdown(await load(tx, f), "day", { now: NOW, db: tx })).rows;
    });
    const oct2 = rows.find((r) => r.day === "2026-10-02");
    expect(oct2).toMatchObject({ visitors: 1, converters: 1, orders: 1, revenue: 100 });
    expect(rows.find((r) => r.day === "2026-10-08")).toBeUndefined();
  });

  it("uses the shop timezone for the day boundary, not UTC", async () => {
    const days = await inRollback(async (tx) => {
      const berlin = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      const utc = await seedExperiment(tx, { timezone: "UTC", startedAt: new Date("2026-10-01T00:00:00Z") });
      for (const f of [berlin, utc]) await addExposure(tx, f, { at: "2026-10-02T23:00:00Z", visitorId: vid(1) });
      return {
        berlin: (await breakdown(await load(tx, berlin), "day", { now: NOW, db: tx })).rows,
        utc: (await breakdown(await load(tx, utc), "day", { now: NOW, db: tx })).rows,
      };
    });
    // 23:00 UTC on 2 October is 01:00 on 3 October in Berlin.
    expect(days.berlin.find((r) => r.visitors === 1)?.day).toBe("2026-10-03");
    expect(days.utc.find((r) => r.visitors === 1)?.day).toBe("2026-10-02");
  });

  it("gets a 25-hour DST day right", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-20T00:00:00Z") });
      // Berlin falls back on 25 October 2026: that local day runs 24 Oct 22:00Z .. 25 Oct 23:00Z.
      await addExposure(tx, f, { at: "2026-10-24T22:30:00Z", visitorId: vid(1) });
      await addExposure(tx, f, { at: "2026-10-25T22:30:00Z", visitorId: vid(2) });
      await addExposure(tx, f, { at: "2026-10-25T23:30:00Z", visitorId: vid(3) });
      return (await breakdown(await load(tx, f), "day", { now: new Date("2026-10-28T00:00:00Z"), db: tx })).rows;
    });
    expect(rows.find((r) => r.day === "2026-10-25")?.visitors).toBe(2);
    expect(rows.find((r) => r.day === "2026-10-26")?.visitors).toBe(1);
  });

  it("acceptance: a tainted day is missing from the series, and from the day axis", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, {
        timezone: "Europe/Berlin",
        startedAt: new Date("2026-10-01T00:00:00Z"),
        taintedDays: ["2026-10-03"],
      });
      for (const [i, day] of ["2026-10-02", "2026-10-03", "2026-10-04"].entries()) {
        await addExposure(tx, f, { at: `${day}T10:00:00Z`, visitorId: vid(i + 1) });
        await addOrder(tx, f, { at: "2026-10-08T10:00:00Z", total: 100, visitorId: vid(i + 1) });
      }
      const experiment = await load(tx, f);
      return {
        rows: (await breakdown(experiment, "day", { now: NOW, db: tx })).rows,
        days: (await breakdown(experiment, "day", { now: NOW, db: tx })).days,
        stats: await computeStatsFor(experiment, { now: NOW, db: tx }),
      };
    });
    expect(result.rows.map((r) => r.day)).not.toContain("2026-10-03");
    expect(result.days).not.toContain("2026-10-03");
    expect(result.days).toContain("2026-10-02");
    expect(result.days).toContain("2026-10-04");
    // The remaining days still sum to what evaluate() says – the tainted day is gone from both.
    expect(totals(result.rows).visitors).toBe(result.stats.variants.reduce((s, v) => s + v.visitors, 0));
    expect(totals(result.rows).orders).toBe(2);
  });

  it("returns a full day axis so a day without data is a visible gap, not a missing point", async () => {
    const days = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T10:00:00Z", visitorId: vid(1) });
      return (await breakdown(await load(tx, f), "day", { now: new Date("2026-10-05T12:00:00Z"), db: tx })).days;
    });
    expect(days).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });

  it("puts an order it cannot date on a null day rather than inventing one", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T10:00:00Z", visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-08T10:00:00Z", total: 77 }); // no `_ab_v`, no customer
      return (await breakdown(await load(tx, f), "day", { now: NOW, db: tx })).rows;
    });
    const nullDay = rows.find((r) => r.day === null);
    expect(nullDay).toMatchObject({ orders: 1, converters: 1, revenue: 77, visitors: 0 });
  });

  it("has segment 'all' on the pure day dimension", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      return (await breakdown(await load(tx, f), "day", { now: NOW, db: tx })).rows;
    });
    expect(rows.every((r) => r.segment === "all")).toBe(true);
  });
});

describe("day × dimension", () => {
  it("carries both keys and still dates the conversion by the exposure day", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T10:00:00Z", visitorId: vid(1), device: "mobile" });
      await addExposure(tx, f, { at: "2026-10-03T10:00:00Z", visitorId: vid(2), device: "desktop" });
      await addOrder(tx, f, { at: "2026-10-09T10:00:00Z", total: 100, visitorId: vid(1) });
      return (await breakdown(await load(tx, f), "device", { byDay: true, now: NOW, db: tx })).rows;
    });
    expect(rows.find((r) => r.day === "2026-10-02" && r.segment === "mobile")).toMatchObject({ visitors: 1, orders: 1, revenue: 100 });
    expect(rows.find((r) => r.day === "2026-10-03" && r.segment === "desktop")).toMatchObject({ visitors: 1, orders: 0 });
    expect(rows.find((r) => r.day === "2026-10-09")).toBeUndefined();
  });

  it("reports byDay and the dimension it was asked for", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedMixed(tx);
      const experiment = await load(tx, f);
      return {
        plain: await breakdown(experiment, "channel", { now: NOW, db: tx }),
        withDay: await breakdown(experiment, "channel", { byDay: true, now: NOW, db: tx }),
        day: await breakdown(experiment, "day", { now: NOW, db: tx }),
      };
    });
    expect(result.plain.byDay).toBe(false);
    expect(result.plain.rows.every((r) => r.day === null)).toBe(true);
    expect(result.withDay.byDay).toBe(true);
    expect(result.withDay.dimension).toBe("channel");
    expect(result.day.byDay).toBe(true); // the day dimension is by definition by day
  });
});
