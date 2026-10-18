import { describe, it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../src/app";
import { seedDemo, type SeedResult } from "../src/dev/seed";
import { MINUTE, manualClock } from "../src/shared/clock";
import { ConflictError, OutOfStockError, PaymentDeclinedError, ValidationError } from "../src/shared/errors";
import { InventoryService } from "../src/inventory/inventory-service";
import { EventBus } from "../src/shared/events";
import { createIdGenerator } from "../src/shared/ids";

describe("checkout and order lifecycle", () => {
  let app: App;
  let seed: SeedResult;
  beforeEach(() => {
    app = createApp();
    seed = seedDemo(app);
  });

  it("places an order, reserves stock, clears the cart", () => {
    app.carts.addItem(seed.aliceId, "TEE-M", 2);
    app.carts.addItem(seed.aliceId, "PAN-10", 1);
    const order = app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" });
    expect(order.status).toBe("pending");
    expect(order.subtotalCents).toBe(7500);
    expect(order.shippingCents).toBe(0); // over the $50 threshold
    expect(order.totalCents).toBe(7500 + 544);
    expect(app.inventory.level("TEE-M")).toEqual({ sku: "TEE-M", onHand: 50, reserved: 2 });
    expect(app.carts.getOrCreate(seed.aliceId).lines).toHaveLength(0);
    expect(app.events.ofType("order.placed")).toHaveLength(1);
  });

  it("rejects empty carts and out-of-stock lines", () => {
    expect(() => app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" })).toThrow(ValidationError);
    app.carts.addItem(seed.aliceId, "KNIFE-8", 6);
    expect(() => app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" })).toThrow(OutOfStockError);
  });

  it("redeems the coupon once the order is placed", () => {
    app.carts.addItem(seed.aliceId, "BOOK-NOVEL", 2);
    app.carts.applyCoupon(seed.aliceId, "welcome5");
    const order = app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" });
    expect(order.orderDiscountCents).toBe(500);
    expect(app.repos.coupons.findByCode("WELCOME5")!.redemptions).toBe(1);
  });

  it("pays, ships and delivers", () => {
    app.carts.addItem(seed.aliceId, "HOOD-M", 1);
    const order = app.checkout.checkout(seed.aliceId, { shippingMethod: "express" });
    expect(() => app.orders.pay(order.id, "tok_decline")).toThrow(PaymentDeclinedError);
    expect(app.orders.require(order.id).status).toBe("pending");
    const paid = app.orders.pay(order.id, "tok_visa");
    expect(paid.status).toBe("paid");
    expect(app.inventory.level("HOOD-M")).toEqual({ sku: "HOOD-M", onHand: 9, reserved: 0 });
    expect(app.payments.charges.get(paid.paymentId!)!.amountCents).toBe(order.totalCents);
    app.orders.ship(order.id, "1Z999");
    const delivered = app.orders.deliver(order.id);
    expect(delivered.history.map((h) => h.status)).toEqual(["pending", "paid", "shipped", "delivered"]);
    expect(() => app.orders.ship(order.id, "1Z999")).toThrow(ConflictError);
  });

  it("expires unpaid orders and frees their stock", () => {
    app.carts.addItem(seed.aliceId, "KNIFE-8", 5);
    const order = app.checkout.checkout(seed.aliceId, { shippingMethod: "standard" });
    expect(app.inventory.available("KNIFE-8")).toBe(0);
    app.clock.advance(15 * MINUTE);
    expect(app.orders.expirePending()).toEqual([order.id]);
    expect(app.orders.require(order.id).status).toBe("cancelled");
    expect(app.inventory.available("KNIFE-8")).toBe(5);
    expect(() => app.orders.pay(order.id, "tok_visa")).toThrow(ConflictError);
  });
});

describe("InventoryService", () => {
  const clock = manualClock();
  let inv: InventoryService;
  let events: EventBus;
  beforeEach(() => {
    events = new EventBus(clock);
    inv = new InventoryService({ clock, events, ids: createIdGenerator() });
    inv.setStock("A", 10);
    inv.setStock("B", 2);
  });

  it("reserves and commits", () => {
    const r = inv.reserve([{ sku: "A", quantity: 3 }]);
    expect(inv.available("A")).toBe(7);
    inv.commit(r.id);
    expect(inv.level("A")).toEqual({ sku: "A", onHand: 7, reserved: 0 });
  });

  it("is all-or-nothing", () => {
    expect(() => inv.reserve([{ sku: "A", quantity: 3 }, { sku: "B", quantity: 5 }])).toThrow(OutOfStockError);
    expect(inv.available("A")).toBe(10);
  });

  it("releases idempotently and expires stale reservations", () => {
    const r = inv.reserve([{ sku: "A", quantity: 4 }], 10 * MINUTE);
    inv.release(r.id);
    inv.release(r.id);
    expect(inv.available("A")).toBe(10);
    inv.reserve([{ sku: "A", quantity: 4 }], 10 * MINUTE);
    clock.advance(10 * MINUTE);
    expect(inv.expireStale()).toHaveLength(1);
    expect(inv.available("A")).toBe(10);
  });

  it("emits low stock events", () => {
    inv.reserve([{ sku: "A", quantity: 6 }]);
    const low = events.ofType("inventory.low_stock");
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ sku: "A", available: 4 });
  });
});
