import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";
import { DAY } from "../../src/shared/clock";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

/** TEE-M x3, BOOK x1, PAN-10 x1 with 20% off kitchen, SAVE10, express to US-CA. */
function deliveredOrder(customerId = seed.aliceId) {
  app.repos.promotions.save({ id: "kitchen20", kind: "category_percent", category: "kitchen", percent: 20 });
  app.carts.addItem(customerId, "TEE-M", 3);
  app.carts.addItem(customerId, "BOOK-NOVEL", 1);
  app.carts.addItem(customerId, "PAN-10", 1);
  app.carts.applyCoupon(customerId, "SAVE10");
  const order = app.checkout.checkout(customerId, { shippingMethod: "express" });
  app.orders.pay(order.id, "tok_visa");
  app.orders.ship(order.id, "1Z-RET");
  app.orders.deliver(order.id);
  return app.orders.require(order.id);
}

const ret = (orderId: string, lines: Array<{ sku: string; quantity: number }>, token = seed.aliceToken) =>
  app.request("POST", `/orders/${orderId}/returns`, { token, body: { lines } });

it("refunds exactly what was paid across partial returns, never shipping", async () => {
  const order = deliveredOrder();
  expect(order.totalCents).toBe(11641);
  expect(order.shippingCents).toBe(1699);

  const r1 = await ret(order.id, [{ sku: "TEE-M", quantity: 1 }]);
  expect(r1.status).toBe(201);
  expect((r1.body as { refundCents: number }).refundCents).toBe(1930);

  const r2 = await ret(order.id, [{ sku: "TEE-M", quantity: 1 }, { sku: "BOOK-NOVEL", quantity: 1 }]);
  expect((r2.body as { refundCents: number }).refundCents).toBe(1930 + 1448);
  expect((r2.body as { order: { status: string } }).order.status).toBe("delivered");

  const r3 = await ret(order.id, [{ sku: "PAN-10", quantity: 1 }, { sku: "TEE-M", quantity: 1 }]);
  expect((r3.body as { refundCents: number }).refundCents).toBe(1931 + 2703);
  expect((r3.body as { order: { status: string } }).order.status).toBe("returned");

  const refunded = app.payments.refunds.reduce((n, r) => n + r.amountCents, 0);
  expect(refunded).toBe(order.totalCents - order.shippingCents);
  expect(app.payments.refunds.every((r) => r.chargeId === order.paymentId)).toBe(true);
  expect(app.events.ofType("order.returned" as never).map((e) => (e as unknown as { refundCents: number }).refundCents)).toEqual([1930, 3378, 4634]);
});

it("restocks returned units and rejects over-returns atomically", async () => {
  const order = deliveredOrder();
  expect(app.inventory.level("TEE-M")).toEqual({ sku: "TEE-M", onHand: 47, reserved: 0 });
  await ret(order.id, [{ sku: "TEE-M", quantity: 2 }]);
  expect(app.inventory.level("TEE-M")).toEqual({ sku: "TEE-M", onHand: 49, reserved: 0 });

  const refundsBefore = app.payments.refunds.length;
  for (const lines of [
    [{ sku: "BOOK-NOVEL", quantity: 1 }, { sku: "TEE-M", quantity: 2 }],
    [{ sku: "HOOD-M", quantity: 1 }],
    [{ sku: "BOOK-NOVEL", quantity: 0 }],
  ]) {
    const res = await ret(order.id, lines);
    expect([JSON.stringify(lines), res.status]).toEqual([JSON.stringify(lines), 400]);
  }
  expect(app.payments.refunds.length).toBe(refundsBefore);
  expect(app.inventory.level("BOOK-NOVEL").onHand).toBe(99);
});

it("enforces the 30-day window from delivery and the delivered state", async () => {
  const order = deliveredOrder();
  app.clock.advance(30 * DAY);
  const token = app.sessions.issue(seed.aliceId).token; // sessions last 24h
  expect((await ret(order.id, [{ sku: "BOOK-NOVEL", quantity: 1 }], token)).status).toBe(201);
  app.clock.advance(1);
  expect((await ret(order.id, [{ sku: "PAN-10", quantity: 1 }], token)).status).toBe(409);

  app.carts.addItem(seed.aliceId, "HOOD-M", 1);
  const notDelivered = app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" });
  app.orders.pay(notDelivered.id, "tok_visa");
  expect((await ret(notDelivered.id, [{ sku: "HOOD-M", quantity: 1 }], token)).status).toBe(409);
});

it("hides other customers' orders", async () => {
  const order = deliveredOrder(seed.bobId);
  expect((await ret(order.id, [{ sku: "BOOK-NOVEL", quantity: 1 }], seed.aliceToken)).status).toBe(404);
  expect(app.payments.refunds).toHaveLength(0);
});
