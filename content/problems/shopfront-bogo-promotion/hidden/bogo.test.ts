import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

const B2G1 = { id: "summer-b2g1", kind: "buy_x_get_y", category: "apparel", buy: 2, get: 1 };

const quote = (lines: Array<[string, number]>, couponCode?: string) =>
  app.pricing.quote({ lines: lines.map(([sku, quantity]) => ({ sku, quantity, productId: "" })), region: "US-OR", shippingMethod: "standard", couponCode });

it("pools units across lines and frees the cheapest", () => {
  app.repos.promotions.save(B2G1 as never);
  const q = quote([["TEE-L", 2], ["HOOD-M", 1], ["TEE-M", 3], ["BOOK-NOVEL", 3]]);
  const d = Object.fromEntries(q.lines.map((l) => [l.sku, l.discountCents]));
  expect(d).toEqual({ "TEE-L": 0, "HOOD-M": 0, "TEE-M": 4000, "BOOK-NOVEL": 0 });
  expect(q.adjustments).toEqual([{ ruleId: "summer-b2g1", label: "Buy 2 get 1 free (apparel)", amountCents: 4000, sku: "TEE-M" }]);

  // ties on unit price: the earlier cart line goes first; 5 units -> only 1 free
  const t = quote([["TEE-S", 1], ["TEE-M", 4]]);
  expect(t.lines.map((l) => l.discountCents)).toEqual([2000, 0]);
});

it("applies before percent promotions and coupons", () => {
  app.repos.promotions.save({ id: "apparel10", kind: "category_percent", category: "apparel", percent: 10 });
  app.repos.promotions.save(B2G1 as never);
  const q = quote([["TEE-L", 2], ["TEE-M", 3], ["HOOD-M", 1]], "SAVE10");
  // free: 2 x TEE-M (4000). Then 10%: 440 + 200 + 550. Then coupon 10% of 10710.
  expect(q.itemDiscountCents).toBe(5190);
  expect(q.orderDiscountCents).toBe(1071);
});

it("can be created through the admin API and shows up in cart quotes", async () => {
  const bad = await app.request("POST", "/admin/promotions", { token: seed.adminToken, body: { ...B2G1, id: "bad", get: 0 } });
  expect(bad.status).toBe(400);
  const bad2 = await app.request("POST", "/admin/promotions", { token: seed.adminToken, body: { ...B2G1, id: "bad2", buy: 1.5 } });
  expect(bad2.status).toBe(400);
  const created = await app.request("POST", "/admin/promotions", { token: seed.adminToken, body: B2G1 });
  expect(created.status).toBe(201);
  app.carts.addItem(seed.aliceId, "TEE-M", 3);
  const q = await app.request("GET", "/cart/quote", { token: seed.aliceToken });
  expect(q.body).toMatchObject({ subtotalCents: 6000, itemDiscountCents: 2000 });
});
