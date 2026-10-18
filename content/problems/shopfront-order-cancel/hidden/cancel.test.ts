import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

function place(customerId: string) {
  app.carts.addItem(customerId, "HOOD-M", 2);
  app.carts.addItem(customerId, "TEE-M", 1);
  return app.checkout.checkout(customerId, { shippingMethod: "express" });
}

it("cancels a pending order and releases its reservation", async () => {
  const order = place(seed.aliceId);
  const res = await app.request("POST", `/orders/${order.id}/cancel`, { token: seed.aliceToken, body: { reason: "changed my mind" } });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: "cancelled" });
  expect(app.inventory.level("HOOD-M")).toEqual({ sku: "HOOD-M", onHand: 10, reserved: 0 });
  expect(app.events.ofType("order.cancelled")).toHaveLength(1);
  expect(app.events.ofType("order.cancelled")[0]).toMatchObject({ orderId: order.id, reason: "changed my mind" });
});

it("cancels a paid order: restocks and refunds the full amount", async () => {
  const order = place(seed.aliceId);
  app.orders.pay(order.id, "tok_visa");
  expect(app.inventory.level("HOOD-M").onHand).toBe(8);
  const res = await app.request("POST", `/orders/${order.id}/cancel`, { token: seed.aliceToken });
  expect(res.status).toBe(200);
  expect(app.inventory.level("HOOD-M")).toEqual({ sku: "HOOD-M", onHand: 10, reserved: 0 });
  expect(app.inventory.level("TEE-M")).toEqual({ sku: "TEE-M", onHand: 50, reserved: 0 });
  expect(app.payments.refunds).toEqual([{ chargeId: app.orders.require(order.id).paymentId!, amountCents: order.totalCents }]);
  expect(app.orders.require(order.id).status).toBe("cancelled");
  expect(app.events.ofType("order.cancelled")[0]).toMatchObject({ reason: "customer_request" });
});

it("refuses shipped orders and hides other customers' orders", async () => {
  const order = place(seed.aliceId);
  app.orders.pay(order.id, "tok_visa");
  expect((await app.request("POST", `/orders/${order.id}/cancel`, { token: seed.bobToken })).status).toBe(404);
  app.orders.ship(order.id, "1Z-TRACK");
  const res = await app.request("POST", `/orders/${order.id}/cancel`, { token: seed.aliceToken });
  expect(res.status).toBe(409);
  expect(app.orders.require(order.id).status).toBe("shipped");
  expect(app.payments.refunds).toHaveLength(0);
  expect(app.inventory.level("HOOD-M").onHand).toBe(8);
});

it("lets an admin cancel any customer's order", async () => {
  const order = place(seed.bobId);
  const res = await app.request("POST", `/orders/${order.id}/cancel`, { token: seed.adminToken, body: { reason: "fraud" } });
  expect(res.status).toBe(200);
  expect(app.inventory.available("HOOD-M")).toBe(10);
});
