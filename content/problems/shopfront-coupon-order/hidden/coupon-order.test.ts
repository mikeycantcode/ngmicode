import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo } from "../../src/dev/seed";

let app: App;
beforeEach(() => {
  app = createApp();
  seedDemo(app);
});

const quote = (lines: Array<[string, number]>, couponCode?: string) =>
  app.pricing.quote({ lines: lines.map(([sku, quantity]) => ({ sku, quantity, productId: "" })), region: "US-OR", shippingMethod: "standard", couponCode });

it("applies the coupon after item promotions (ticket #5521)", () => {
  app.repos.promotions.save({ id: "kitchen20", kind: "category_percent", category: "kitchen", percent: 20 });
  const q = quote([["PAN-10", 2]], "SAVE10");
  expect(q.itemDiscountCents).toBe(1400);
  expect(q.orderDiscountCents).toBe(560);
  expect(q.subtotalCents - q.itemDiscountCents - q.orderDiscountCents).toBe(5040);
});

it("checks coupon minimum spend against the promoted total", () => {
  app.repos.promotions.save({ id: "books40", kind: "category_percent", category: "books", percent: 40 });
  expect(() => quote([["BOOK-NOVEL", 2]], "WELCOME5")).toThrow(/at least/);
});
