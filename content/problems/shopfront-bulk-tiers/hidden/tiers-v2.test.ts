import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo } from "../../src/dev/seed";
import { volumeTierRule } from "../../src/pricing/tiers";

let app: App;
beforeEach(() => {
  app = createApp();
  seedDemo(app);
});

const quote = (lines: Array<[string, number]>) =>
  app.pricing.quote({ lines: lines.map(([sku, quantity]) => ({ sku, quantity, productId: "" })), region: "US-OR", shippingMethod: "standard" });

it("counts quantity per product across variants and labels adjustments", () => {
  app.repos.promotions.save({ id: "bulk", kind: "volume_tier", label: "Bulk", tiers: [{ minQty: 6, percent: 20 }, { minQty: 3, percent: 10 }] });
  const q = quote([["TEE-S", 2], ["TEE-M", 2], ["BOOK-NOVEL", 2]]);
  expect(q.lines.find((l) => l.sku === "TEE-S")!.discountCents).toBe(400);
  expect(q.lines.find((l) => l.sku === "TEE-M")!.discountCents).toBe(400);
  expect(q.lines.find((l) => l.sku === "BOOK-NOVEL")!.discountCents).toBe(0);
  expect(q.adjustments.map((a) => a.label)).toEqual(["Bulk (10% off)", "Bulk (10% off)"]);
});

it("rounds down on the net left by earlier promotions", () => {
  app.repos.promotions.save({ id: "books15", kind: "category_percent", category: "books", percent: 15 });
  app.repos.promotions.save({ id: "bulk", kind: "volume_tier", tiers: [{ minQty: 3, percent: 7 }] });
  const q = quote([["BOOK-NOVEL", 3]]);
  // 4500 - 675 = 3825; 7% = 267.75 -> 267
  expect(q.itemDiscountCents).toBe(675 + 267);
});

it("ignores excluded lines for both counting and discounting", () => {
  app.catalog.createProduct({
    slug: "gift-card",
    name: "Gift Card",
    category: "gifts",
    tags: ["no-volume-discount"],
    variants: [
      { sku: "GIFT-25", name: "$25", priceCents: 2500, weightGrams: 0 },
      { sku: "GIFT-50", name: "$50", priceCents: 5000, weightGrams: 0 },
    ],
  });
  app.repos.promotions.save({ id: "bulk", kind: "volume_tier", tiers: [{ minQty: 2, percent: 10 }] });
  const q = quote([["GIFT-25", 3], ["GIFT-50", 1], ["PAN-10", 1], ["PAN-12", 1]]);
  expect(q.lines.filter((l) => l.sku.startsWith("GIFT")).map((l) => l.discountCents)).toEqual([0, 0]);
  expect(q.lines.filter((l) => l.sku.startsWith("PAN")).map((l) => l.discountCents)).toEqual([350, 450]);
});

it("validates tiers eagerly with exact messages", () => {
  expect(() => volumeTierRule("x", [])).toThrow("volume tiers must not be empty");
  expect(() => volumeTierRule("x", [{ minQty: 1, percent: 10 }])).toThrow("invalid tier minQty: 1");
  expect(() => volumeTierRule("x", [{ minQty: 3, percent: 60 }])).toThrow("invalid tier percent: 60");
  expect(() => volumeTierRule("x", [{ minQty: 3, percent: 2.5 }])).toThrow(RangeError);
  expect(() => volumeTierRule("x", [{ minQty: 3, percent: 10 }, { minQty: 3, percent: 0 }])).toThrow("invalid tier percent: 0");
  expect(() => volumeTierRule("x", [{ minQty: 5, percent: 10 }, { minQty: 2, percent: 5 }, { minQty: 5, percent: 20 }])).toThrow(
    "duplicate tier minQty: 5",
  );
  const tiers = [{ minQty: 2, percent: 5 }, { minQty: 5, percent: 10 }];
  volumeTierRule("x", tiers);
  expect(tiers).toEqual([{ minQty: 2, percent: 5 }, { minQty: 5, percent: 10 }]);
});
