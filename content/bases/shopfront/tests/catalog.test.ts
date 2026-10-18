import { describe, it, expect, beforeEach } from "testkit";
import { createApp, type App } from "../src/app";
import { seedDemo } from "../src/dev/seed";
import { searchProducts } from "../src/catalog/search";
import { ConflictError, ValidationError } from "../src/shared/errors";

describe("catalog", () => {
  let app: App;
  beforeEach(() => {
    app = createApp();
    seedDemo(app);
  });

  it("rejects invalid and duplicate products", () => {
    expect(() =>
      app.catalog.createProduct({ slug: "Bad Slug", name: "", category: "x", variants: [] }),
    ).toThrow(ValidationError);
    expect(() =>
      app.catalog.createProduct({ slug: "tee-2", name: "Tee 2", category: "apparel", variants: [{ sku: "TEE-S", name: "S", priceCents: 100, weightGrams: 1 }] }),
    ).toThrow(ConflictError);
  });

  it("bumps version and emits product.updated with changed keys", () => {
    const tee = app.repos.products.findBySlug("tee")!;
    const updated = app.catalog.setActive(tee.id, false);
    expect(updated.version).toBe(2);
    expect(app.events.ofType("product.updated").pop()!.changes).toEqual(["active"]);
  });

  it("searches with AND terms, filters and facets", () => {
    const s = (q: Parameters<typeof searchProducts>[2]) => searchProducts(app.repos.products, app.inventory, q);
    expect(s({ q: "cast iron" }).items.map((p) => p.slug)).toEqual(["pan"]);
    expect(s({ q: "zzz" }).total).toBe(0);
    const kitchen = s({ category: "kitchen", sort: "price_asc" });
    expect(kitchen.items.map((p) => p.slug)).toEqual(["pan", "chef-knife"]); // inactive mug hidden
    expect(kitchen.facets.categories).toEqual({ apparel: 2, kitchen: 2, books: 1 });
    expect(s({ maxPriceCents: 2000 }).items.map((p) => p.slug).sort()).toEqual(["novel", "tee"]);
  });

  it("filters out-of-stock products when asked", () => {
    app.inventory.adjust("KNIFE-8", -5, "damaged");
    const s = searchProducts(app.repos.products, app.inventory, { category: "kitchen", inStockOnly: true });
    expect(s.items.map((p) => p.slug)).toEqual(["pan"]);
  });

  it("paginates 1-based", () => {
    const s = searchProducts(app.repos.products, app.inventory, { sort: "name", page: 2, pageSize: 2 });
    expect(s.items.map((p) => p.slug)).toEqual(["tee", "novel"]);
    expect(s.total).toBe(5);
  });
});
