import { describe, it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../src/app";
import { seedDemo } from "../src/dev/seed";
import { ValidationError } from "../src/shared/errors";
import { assertCents, bpsOf, formatCents, percentOf, splitEvenly, sumCents } from "../src/shared/money";
import { quoteShipping } from "../src/shipping/rates";

describe("PricingEngine", () => {
  let app: App;
  beforeEach(() => {
    app = createApp();
    seedDemo(app);
  });

  const quote = (lines: Array<[string, number]>, extra: { couponCode?: string; region?: string } = {}) =>
    app.pricing.quote({
      lines: lines.map(([sku, quantity]) => ({ sku, quantity, productId: "" })),
      region: extra.region ?? "US-OR",
      shippingMethod: "standard",
      couponCode: extra.couponCode,
    });

  it("prices lines, shipping and tax", () => {
    const q = quote([["TEE-M", 2]], { region: "US-CA" });
    expect(q.subtotalCents).toBe(4000);
    expect(q.shippingCents).toBe(499);
    expect(q.taxCents).toBe(290); // 7.25% of 4000
    expect(q.totalCents).toBe(4000 + 499 + 290);
  });

  it("applies category promotions per line", () => {
    app.repos.promotions.save({ id: "kitchen20", kind: "category_percent", category: "kitchen", percent: 20 });
    const q = quote([["PAN-10", 1], ["TEE-M", 1]]);
    expect(q.itemDiscountCents).toBe(700);
    expect(q.lines.find((l) => l.sku === "TEE-M")!.discountCents).toBe(0);
  });

  it("applies volume tiers by quantity", () => {
    app.repos.promotions.save({ id: "bulk", kind: "volume_tier", tiers: [{ minQty: 3, percent: 5 }, { minQty: 10, percent: 10 }] });
    expect(quote([["BOOK-NOVEL", 10]]).itemDiscountCents).toBe(1500);
    expect(quote([["BOOK-NOVEL", 4]]).itemDiscountCents).toBe(300);
    expect(quote([["BOOK-NOVEL", 2]]).itemDiscountCents).toBe(0);
  });

  it("applies coupons to the discounted goods total", () => {
    app.repos.promotions.save({ id: "kitchen20", kind: "category_percent", category: "kitchen", percent: 20 });
    const q = quote([["PAN-10", 2]], { couponCode: "save10" });
    expect(q.itemDiscountCents).toBe(1400);
    expect(q.orderDiscountCents).toBe(560); // 10% of 5600
    expect(q.couponCode).toBe("SAVE10");
  });

  it("enforces coupon minimums and expiry", () => {
    expect(() => quote([["BOOK-NOVEL", 1]], { couponCode: "WELCOME5" })).toThrow(/at least/);
    expect(() => quote([["BOOK-NOVEL", 2]], { couponCode: "EXPIRED" })).toThrow(ValidationError);
    expect(quote([["BOOK-NOVEL", 2]], { couponCode: "WELCOME5" }).orderDiscountCents).toBe(500);
  });

  it("refuses inactive products", () => {
    expect(() => quote([["MUG-OLD", 1]])).toThrow(/no longer available/);
  });
});

describe("money", () => {
  it("rounds percentages half-up to whole cents", () => {
    expect(percentOf(999, 10)).toBe(100);
    expect(percentOf(1000, 15)).toBe(150);
    expect(percentOf(105, 10)).toBe(11); // 10.5 -> 11
  });

  it("computes basis points", () => {
    expect(bpsOf(10000, 725)).toBe(725);
    expect(bpsOf(199, 725)).toBe(14); // 14.4275
  });

  it("formats simple amounts", () => {
    expect(formatCents(1250)).toBe("$12.50");
    expect(formatCents(5)).toBe("$0.05");
  });

  it("splits evenly with remainder going to the first parts", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(sumCents(splitEvenly(7, 4), (x) => x)).toBe(7);
  });

  it("rejects fractional cents", () => {
    expect(() => assertCents(12.5)).toThrow(RangeError);
    expect(() => assertCents(12)).not.toThrow();
  });
});

describe("quoteShipping", () => {
  it("charges US standard by billable kg", () => {
    expect(quoteShipping({ method: "standard", region: "US-CA", weightGrams: 800, goodsNetCents: 1000 })).toBe(499);
    expect(quoteShipping({ method: "standard", region: "US-CA", weightGrams: 2500, goodsNetCents: 1000 })).toBe(699);
  });

  it("makes US standard free at the threshold but never express", () => {
    expect(quoteShipping({ method: "standard", region: "US-NY", weightGrams: 2500, goodsNetCents: 5000 })).toBe(0);
    expect(quoteShipping({ method: "express", region: "US-NY", weightGrams: 500, goodsNetCents: 50000 })).toBe(1299);
  });

  it("prices EU and rejects overnight outside the contiguous US", () => {
    expect(quoteShipping({ method: "standard", region: "EU-DE", weightGrams: 1200, goodsNetCents: 4000 })).toBe(1049);
    expect(() => quoteShipping({ method: "overnight", region: "EU-FR", weightGrams: 100, goodsNetCents: 0 })).toThrow(ValidationError);
  });
});
