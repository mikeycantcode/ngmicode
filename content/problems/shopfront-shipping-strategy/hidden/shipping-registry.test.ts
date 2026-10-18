import { it, expect } from "testkit";
import { createApp } from "../../src/app";
import { seedDemo } from "../../src/dev/seed";
import * as rates from "../../src/shipping/rates";
import { ConflictError, ValidationError } from "../../src/shared/errors";

const r = rates as unknown as {
  quoteShipping: (i: { method: string; region: string; weightGrams: number; goodsNetCents: number }) => number;
  registerShippingMethod: (c: { method: string; isAvailable(region: string): boolean; price(i: { kg: number; goodsNetCents: number; region: string }): number }) => void;
  listShippingMethods: (region: string) => string[];
};

it("keeps every built-in price and error identical", () => {
  const golden: Array<[string, string, number, number, number]> = [
    ["standard", "US-CA", 0, 0, 499],
    ["standard", "US-CA", 1000, 4999, 499],
    ["standard", "US-CA", 1001, 4999, 599],
    ["standard", "US-TX", 5400, 4999, 999],
    ["standard", "US-CA", 1001, 5000, 0],
    ["standard", "US-AK", 300, 1000, 1499],
    ["standard", "US-HI", 300, 9000, 1000],
    ["standard", "EU-DE", 999, 9999, 899],
    ["standard", "EU-FR", 3500, 10000, 0],
    ["express", "US-NY", 2500, 99999, 1699],
    ["express", "US-AK", 1500, 0, 2499],
    ["express", "EU-DE", 4001, 100000, 3199],
    ["overnight", "US-CA", 2000, 0, 2999],
    ["overnight", "US-CA", 2001, 0, 3499],
    ["overnight", "US-OR", 7200, 80000, 5999],
  ];
  for (const [method, region, weightGrams, goodsNetCents, expected] of golden) {
    expect([method, region, weightGrams, goodsNetCents, r.quoteShipping({ method, region, weightGrams, goodsNetCents })]).toEqual([
      method, region, weightGrams, goodsNetCents, expected,
    ]);
  }
  const q = (method: string, region: string) => () => r.quoteShipping({ method, region, weightGrams: 100, goodsNetCents: 0 });
  expect(q("overnight", "US-AK")).toThrow("overnight shipping is not available in US-AK");
  expect(q("overnight", "EU-FR")).toThrow("overnight shipping is not available in EU-FR");
  expect(q("standard", "CA-ON")).toThrow("we do not ship to CA-ON");
  expect(q("drone", "US-CA")).toThrow(ValidationError);
});

it("registers and lists methods per region", () => {
  r.registerShippingMethod({ method: "pickup", isAvailable: (region) => region === "US-CA", price: () => 0 });
  expect(r.listShippingMethods("US-CA")).toEqual(["standard", "express", "overnight", "pickup"]);
  expect(r.listShippingMethods("US-HI")).toEqual(["standard", "express"]);
  expect(r.listShippingMethods("EU-DE")).toEqual(["standard", "express"]);
  expect(r.listShippingMethods("CA-ON")).toEqual([]);
  expect(() => r.registerShippingMethod({ method: "standard", isAvailable: () => true, price: () => 1 })).toThrow(ConflictError);
  expect(() => r.quoteShipping({ method: "pickup", region: "US-NY", weightGrams: 1, goodsNetCents: 1 })).toThrow(
    "pickup shipping is not available in US-NY",
  );
});

it("lets a registered method flow through estimates and checkout", async () => {
  r.registerShippingMethod({ method: "courier", isAvailable: (region) => region.startsWith("US-"), price: ({ kg }) => 300 * kg });
  const app = createApp();
  const seed = seedDemo(app);
  app.carts.addItem(seed.aliceId, "PAN-12", 1); // 2100 g -> 3 kg
  const est = await app.request("GET", "/cart/shipping-estimates", { token: seed.aliceToken });
  expect(est.status).toBe(200);
  expect((est.body as { estimates: Array<{ method: string; shippingCents: number }> }).estimates.find((e) => e.method === "courier")).toMatchObject({
    shippingCents: 900,
  });
  const quote = await app.request("GET", "/cart/quote?method=courier", { token: seed.aliceToken });
  expect(quote.body).toMatchObject({ shippingCents: 900 });
  const order = await app.request("POST", "/checkout", { token: seed.aliceToken, body: { shippingMethod: "courier" } });
  expect(order.status).toBe(201);
  expect(order.body).toMatchObject({ shippingMethod: "courier", shippingCents: 900 });
  app.carts.addItem(seed.bobId, "BOOK-NOVEL", 1);
  const bogus = await app.request("POST", "/checkout", { token: seed.bobToken, body: { shippingMethod: "teleport" } });
  expect(bogus.status).toBe(400);
});
