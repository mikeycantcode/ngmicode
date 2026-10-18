import { it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../../src/app";
import { seedDemo, type SeedResult } from "../../src/dev/seed";

let app: App;
let seed: SeedResult;
let teeId: string;
beforeEach(() => {
  app = createApp();
  seed = seedDemo(app);
  teeId = app.repos.products.findBySlug("tee")!.id;
});

const patch = (body: unknown, headers: Record<string, string> = {}, token = seed.adminToken) =>
  app.request("PATCH", `/admin/products/${teeId}`, { token, body, headers });

it("applies a partial update through the normal write path", async () => {
  const res = await patch({ name: "Classic Tee v2", variants: [{ sku: "TEE-L", priceCents: 2400 }] });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ name: "Classic Tee v2", slug: "tee", version: 2, category: "apparel" });
  const shown = await app.request("GET", "/products/tee");
  expect(shown.body).toMatchObject({
    variants: [{ sku: "TEE-S", priceCents: 2000 }, { sku: "TEE-M", priceCents: 2000 }, { sku: "TEE-L", priceCents: 2400, name: "Large" }],
  });
  const ev = app.events.ofType("product.updated");
  expect(ev).toHaveLength(1);
  expect([...ev[0].changes].sort()).toEqual(["name", "variants"]);

  const noop = await patch({ name: "Classic Tee v2" });
  expect(noop.status).toBe(200);
  expect(noop.body).toMatchObject({ version: 2 });
  expect(app.events.ofType("product.updated")).toHaveLength(1);
});

it("rejects invalid patches atomically", async () => {
  const bad: unknown[] = [
    { slug: "hacked" },
    { version: 99 },
    { colour: "red" },
    { name: "New", variants: [{ sku: "TEE-L", priceCents: 19.99 }] },
    { name: "New", variants: [{ sku: "HOOD-M", priceCents: 100 }] },
    { name: "" },
  ];
  for (const body of bad) {
    const res = await patch(body);
    expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
  }
  const p = app.repos.products.get(teeId)!;
  expect(p.version).toBe(1);
  expect(p.name).toBe("Classic Tee");
  expect(app.repos.products.findBySku("HOOD-M")!.variant.priceCents).toBe(5500);
});

it("supports optimistic concurrency with If-Match", async () => {
  expect((await patch({ active: false }, { "If-Match": "1" })).status).toBe(200);
  const stale = await patch({ name: "Overwrite" }, { "If-Match": "1" });
  expect(stale.status).toBe(409);
  expect(app.repos.products.get(teeId)!.name).toBe("Classic Tee");
  expect((await patch({ name: "Fresh" }, { "If-Match": "2" })).status).toBe(200);
});

it("is admin only", async () => {
  expect((await patch({ name: "x" }, {}, seed.aliceToken)).status).toBe(403);
  expect((await app.request("PATCH", `/admin/products/${teeId}`, { body: { name: "x" } })).status).toBe(401);
});
