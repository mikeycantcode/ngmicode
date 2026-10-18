import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

it("a partially out-of-stock cart reserves nothing", () => {
  app.carts.addItem(seed.aliceId, "TEE-M", 3);
  app.carts.addItem(seed.aliceId, "PAN-10", 2);
  app.carts.addItem(seed.aliceId, "KNIFE-8", 9);
  expect(() => app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" })).toThrow(/insufficient stock/);
  expect(app.inventory.level("TEE-M")).toEqual({ sku: "TEE-M", onHand: 50, reserved: 0 });
  expect(app.inventory.level("PAN-10")).toEqual({ sku: "PAN-10", onHand: 20, reserved: 0 });
  expect(app.inventory.available("KNIFE-8")).toBe(5);
});

it("a checkout that fails during pricing releases its reservation", async () => {
  app.carts.addItem(seed.aliceId, "BOOK-NOVEL", 1);
  app.carts.applyCoupon(seed.aliceId, "WELCOME5"); // $20 minimum, cart is $15
  const res = await app.request("POST", "/checkout", { token: seed.aliceToken, body: { shippingMethod: "standard" } });
  expect(res.status).toBe(400);
  expect(app.inventory.level("BOOK-NOVEL").reserved).toBe(0);

  // the success path still holds stock for the pending order
  app.carts.removeCoupon(seed.aliceId);
  const ok = await app.request("POST", "/checkout", { token: seed.aliceToken, body: { shippingMethod: "standard" } });
  expect(ok.status).toBe(201);
  expect(app.inventory.level("BOOK-NOVEL")).toEqual({ sku: "BOOK-NOVEL", onHand: 100, reserved: 1 });
});
