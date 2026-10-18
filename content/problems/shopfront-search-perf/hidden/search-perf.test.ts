import { it, expect } from "testkit";
import { createApp, type App } from "../../src/app";
import { searchProducts, type SearchQuery } from "../../src/catalog/search";

const N = 50_000;
const WORDS = ["steel", "oak", "linen", "copper", "wool", "glass", "cedar", "denim"];

// Deterministic LCG so every run builds the same catalog.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function bigCatalog(): App {
  const app = createApp();
  const rand = rng(42);
  const now = app.clock.now();
  for (let i = 0; i < N; i++) {
    const w = WORDS[i % WORDS.length];
    const id = `prod_${i}`;
    const price = 500 + Math.floor(rand() * 20000);
    app.repos.products.save({
      id,
      slug: `item-${i}`,
      name: `${w} item ${i}`,
      description: `A ${WORDS[(i * 7) % WORDS.length]} thing`,
      category: `cat-${i % 200}`,
      tags: i % 3 === 0 ? ["sale", w] : [w],
      active: i % 50 !== 0,
      variants: [
        { sku: `SKU-${i}-A`, name: "A", priceCents: price, weightGrams: 100, attributes: {} },
        { sku: `SKU-${i}-B`, name: "B", priceCents: price + 300, weightGrams: 100, attributes: {} },
      ],
      createdAt: now - i * 1000,
      updatedAt: now,
      version: 1,
    });
    app.inventory.setStock(`SKU-${i}-A`, i % 10 === 0 ? 0 : 3);
    app.inventory.setStock(`SKU-${i}-B`, i % 4 === 0 ? 0 : 3);
  }
  // ~2,000 open checkouts holding stock
  for (let k = 0; k < 2000; k++) {
    const i = Math.floor(rand() * N);
    if (app.inventory.available(`SKU-${i}-A`) > 0) app.inventory.reserve([{ sku: `SKU-${i}-A`, quantity: 1 }]);
  }
  return app;
}

const app = bigCatalog();
const search = (q: SearchQuery) => searchProducts(app.repos.products, app.inventory, q);

it("serves typical storefront queries on a 50k-product catalog quickly", () => {
  const t0 = Date.now();
  const inStock = search({ inStockOnly: true, sort: "price_asc", pageSize: 24 });
  const text = search({ q: "steel", category: "cat-8" });
  const facets = search({ tags: ["sale"], minPriceCents: 1000, maxPriceCents: 5000, page: 3 });
  const elapsed = Date.now() - t0;

  expect(inStock.total).toBe(47_000);
  expect(inStock.items[0].fromPriceCents).toBeLessThanOrEqual(inStock.items[1].fromPriceCents);
  expect(text.items.every((p) => p.category === "cat-8" && p.name.startsWith("steel"))).toBe(true);
  expect(Object.keys(text.facets.categories)).toHaveLength(24);
  expect(facets.page).toBe(3);
  expect(elapsed).toBeLessThan(600);
});

it("reflects catalog and stock changes immediately (no stale results)", () => {
  const before = search({ q: "copper", sort: "price_asc", pageSize: 1 });
  const cheapest = before.items[0];
  const product = app.repos.products.get(cheapest.id)!;

  // sell out every variant of the cheapest copper product
  for (const v of product.variants) {
    const n = app.inventory.available(v.sku);
    if (n > 0) app.inventory.reserve([{ sku: v.sku, quantity: n }]);
  }
  const t0 = Date.now();
  const inStock = search({ q: "copper", sort: "price_asc", pageSize: 5, inStockOnly: true });
  expect(inStock.items.map((p) => p.id)).not.toContain(cheapest.id);

  // deactivate the next one and reprice another to be the cheapest
  app.catalog.setActive(inStock.items[0].id, false);
  const third = app.repos.products.get(inStock.items[1].id)!;
  app.catalog.replaceProduct(third.id, {
    slug: third.slug,
    name: third.name,
    description: third.description,
    category: third.category,
    tags: third.tags,
    variants: third.variants.map((v) => ({ ...v, priceCents: 1 })),
  });
  const after = search({ q: "copper", sort: "price_asc", pageSize: 5, inStockOnly: true });
  expect(Date.now() - t0).toBeLessThan(300);
  expect(after.items[0]).toMatchObject({ id: third.id, fromPriceCents: 1 });
  expect(after.items.map((p) => p.id)).not.toContain(inStock.items[0].id);
});
