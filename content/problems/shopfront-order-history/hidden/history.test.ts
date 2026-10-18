import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

function place(customerId: string, sku: string, qty: number) {
  app.carts.addItem(customerId, sku, qty);
  return app.checkout.checkout(customerId, { shippingMethod: "standard" });
}

type Page = { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };

it("lists only the caller's orders, newest first, as summaries", async () => {
  const a1 = place(seed.aliceId, "TEE-M", 2);
  place(seed.bobId, "BOOK-NOVEL", 1);
  app.carts.addItem(seed.aliceId, "BOOK-NOVEL", 1);
  const a2 = place(seed.aliceId, "TEE-S", 2); // same createdAt as a1 (fixed clock)
  app.clock.advance(1000);
  const a3 = place(seed.aliceId, "PAN-10", 1);

  const res = await app.request("GET", "/orders", { token: seed.aliceToken });
  expect(res.status).toBe(200);
  const body = res.body as Page;
  expect(body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
  expect(body.items.map((o) => o.id)).toEqual([a3.id, a2.id, a1.id]);
  expect(body.items[1]).toEqual({ id: a2.id, status: "pending", totalCents: a2.totalCents, itemCount: 3, createdAt: a2.createdAt });

  const admin = await app.request("GET", "/orders", { token: seed.adminToken });
  expect((admin.body as Page).total).toBe(0);
  expect((await app.request("GET", "/orders")).status).toBe(401);
});

it("filters by status and validates it", async () => {
  const a1 = place(seed.aliceId, "TEE-M", 1);
  place(seed.aliceId, "TEE-S", 1);
  app.orders.pay(a1.id, "tok_visa");
  const paid = await app.request("GET", "/orders?status=paid", { token: seed.aliceToken });
  expect((paid.body as Page).items.map((o) => o.id)).toEqual([a1.id]);
  expect((await app.request("GET", "/orders?status=shipped", { token: seed.aliceToken })).body).toMatchObject({ total: 0, items: [] });
  expect((await app.request("GET", "/orders?status=lost", { token: seed.aliceToken })).status).toBe(400);
});

it("paginates like the rest of the API", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    ids.unshift(place(seed.aliceId, "BOOK-NOVEL", 1).id);
    app.clock.advance(10);
  }
  const p2 = await app.request("GET", "/orders?page=2&pageSize=2", { token: seed.aliceToken });
  expect(p2.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
  expect((p2.body as Page).items.map((o) => o.id)).toEqual(ids.slice(2, 4));
  expect((await app.request("GET", "/orders?pageSize=500", { token: seed.aliceToken })).body).toMatchObject({ pageSize: 100 });
  expect((await app.request("GET", "/orders?page=0", { token: seed.aliceToken })).status).toBe(400);
});
