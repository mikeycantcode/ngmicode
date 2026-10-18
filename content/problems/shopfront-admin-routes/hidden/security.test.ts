import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
});

it("ignores role on public sign-up", async () => {
  const reg = await app.request("POST", "/accounts/register", {
    body: { email: "mallory@example.com", password: "mallory-pass", name: "Mallory", region: "US-NY", role: "admin" },
  });
  expect(reg.status).toBe(201);
  expect(reg.body).toMatchObject({ role: "customer" });
  const login = await app.request("POST", "/accounts/login", { body: { email: "mallory@example.com", password: "mallory-pass" } });
  const token = (login.body as { token: string }).token;
  const coupon = await app.request("POST", "/admin/coupons", { token, body: { code: "FREE100", kind: "percent", value: 100 } });
  expect(coupon.status).toBe(403);
});

it("treats other customers' orders as nonexistent", async () => {
  app.carts.addItem(seed.bobId, "TEE-S", 1);
  const order = app.checkout.checkout(seed.bobId, { shippingMethod: "standard" });
  const other = await app.request("GET", `/orders/${order.id}`, { token: seed.aliceToken });
  const missing = await app.request("GET", `/orders/ord_9999`, { token: seed.aliceToken });
  expect(other.status).toBe(404);
  expect((other.body as { error: { code: string } }).error.code).toBe((missing.body as { error: { code: string } }).error.code);
  const pay = await app.request("POST", `/orders/${order.id}/pay`, { token: seed.aliceToken, body: { paymentToken: "tok_visa" } });
  expect(pay.status).toBe(404);
  expect((await app.request("GET", `/orders/${order.id}`, { token: seed.bobToken })).status).toBe(200);
  expect((await app.request("GET", `/orders/${order.id}`, { token: seed.adminToken })).status).toBe(200);
});

it("guards every admin route", async () => {
  const adminRoutes = app.router.describe().filter((r) => r.split(" ")[1].startsWith("/admin"));
  expect(adminRoutes.length).toBeGreaterThan(5);
  for (const route of adminRoutes) {
    const [method, pattern] = route.split(" ");
    const url = pattern.replace(/:\w+/g, "TEE-S");
    const before = app.inventory.level("TEE-S");
    const anon = await app.request(method as "GET", url, { body: { delta: -50, reason: "pwned", onHand: 0 } });
    const customer = await app.request(method as "GET", url, { token: seed.aliceToken, body: { delta: -50, reason: "pwned", onHand: 0 } });
    expect([route, anon.status]).toEqual([route, 401]);
    expect([route, customer.status]).toEqual([route, 403]);
    expect(app.inventory.level("TEE-S")).toEqual(before);
  }
});
