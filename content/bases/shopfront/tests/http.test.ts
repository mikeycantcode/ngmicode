import { describe, it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../src/app";
import { seedDemo, type SeedResult } from "../src/dev/seed";

describe("http api", () => {
  let app: App;
  let seed: SeedResult;
  beforeEach(() => {
    app = createApp();
    seed = seedDemo(app);
  });

  it("registers and logs in", async () => {
    const reg = await app.request("POST", "/accounts/register", {
      body: { email: "Carol@Example.com", password: "carol-pass-1", name: "Carol", region: "US-NY" },
    });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ email: "carol@example.com", role: "customer" });
    expect((reg.body as Record<string, unknown>).passwordHash).toBeUndefined();
    const login = await app.request("POST", "/accounts/login", { body: { email: "carol@example.com", password: "carol-pass-1" } });
    expect(login.status).toBe(200);
    const me = await app.request("GET", "/accounts/me", { token: (login.body as { token: string }).token });
    expect(me.body).toMatchObject({ name: "Carol" });
    const bad = await app.request("POST", "/accounts/login", { body: { email: "carol@example.com", password: "nope-nope" } });
    expect(bad.status).toBe(401);
  });

  it("maps errors to status codes", async () => {
    expect((await app.request("GET", "/nope")).status).toBe(404);
    expect((await app.request("DELETE", "/products")).status).toBe(405);
    expect((await app.request("GET", "/cart")).status).toBe(401);
    expect((await app.request("GET", "/cart", { token: "sess_bogus" })).status).toBe(401);
    const v = await app.request("POST", "/cart/items", { token: seed.aliceToken, body: { sku: "TEE-M", quantity: 0 } });
    expect(v.status).toBe(400);
    expect(v.body).toMatchObject({ error: { code: "validation_failed", details: ["quantity must be >= 1"] } });
  });

  it("searches products over http", async () => {
    const r = await app.request("GET", "/products?category=apparel&sort=price_desc");
    expect((r.body as { items: Array<{ slug: string }> }).items.map((p) => p.slug)).toEqual(["hoodie", "tee"]);
    const one = await app.request("GET", "/products/pan");
    expect(one.body).toMatchObject({ slug: "pan", variants: [{ sku: "PAN-10", available: 20 }, { sku: "PAN-12", available: 20 }] });
    expect((await app.request("GET", "/products/old-mug")).status).toBe(404);
  });

  it("runs cart -> checkout -> pay", async () => {
    const t = seed.bobToken;
    await app.request("POST", "/cart/items", { token: t, body: { sku: "BOOK-NOVEL", quantity: 3 } });
    const quote = await app.request("GET", "/cart/quote?method=standard", { token: t });
    expect(quote.body).toMatchObject({ subtotalCents: 4500, shippingCents: 1049, taxCents: 855 });
    const est = await app.request("GET", "/cart/shipping-estimates", { token: t });
    expect((est.body as { estimates: Array<{ method: string }> }).estimates.map((e) => e.method)).toEqual(["standard", "express"]);
    const order = await app.request("POST", "/checkout", { token: t, body: { shippingMethod: "standard" } });
    expect(order.status).toBe(201);
    const id = (order.body as { id: string }).id;
    const paid = await app.request("POST", `/orders/${id}/pay`, { token: t, body: { paymentToken: "tok_visa" } });
    expect(paid.body).toMatchObject({ status: "paid" });
  });

  it("hides other customers' orders and guards admin routes", async () => {
    app.carts.addItem(seed.bobId, "TEE-S", 1);
    const order = app.checkout.checkout(seed.bobId, { shippingMethod: "standard" });
    expect((await app.request("GET", `/orders/${order.id}`, { token: seed.aliceToken })).status).toBe(404);
    expect((await app.request("GET", `/orders/${order.id}`, { token: seed.adminToken })).status).toBe(200);
    expect((await app.request("GET", "/admin/orders", { token: seed.aliceToken })).status).toBe(403);
    const list = await app.request("GET", "/admin/orders?status=pending", { token: seed.adminToken });
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  });
});
