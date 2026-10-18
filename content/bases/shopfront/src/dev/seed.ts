import type { App } from "../app";

export interface SeedResult {
  adminId: string;
  adminToken: string;
  aliceId: string;
  aliceToken: string;
  bobId: string;
  bobToken: string;
}

/**
 * Demo data used by the dev console and most tests.
 *
 * Catalog:
 *   tee (apparel)      TEE-S / TEE-M 2000c 200g, TEE-L 2200c 220g    stock 50 each
 *   hoodie (apparel)   HOOD-M 5500c 700g                              stock 10
 *   chef-knife (kitchen) KNIFE-8 8900c 300g                           stock 5
 *   pan (kitchen)      PAN-10 3500c 1500g, PAN-12 4500c 2100g         stock 20 each
 *   novel (books)      BOOK-NOVEL 1500c 400g                          stock 100
 *   discontinued mug (kitchen, inactive) MUG-OLD 1200c 350g           stock 3
 *
 * Coupons: SAVE10 (10% off), WELCOME5 ($5 off, min $20), EXPIRED (expired).
 * No promotions are active by default.
 */
export function seedDemo(app: App): SeedResult {
  const admin = app.accounts.createAdmin({ email: "admin@shopfront.test", password: "admin-pass-1", name: "Ada Admin", region: "US-CA" });
  const alice = app.accounts.register({ email: "alice@example.com", password: "alice-pass-1", name: "Alice", region: "US-CA" });
  const bob = app.accounts.register({ email: "bob@example.com", password: "bob-pass-12", name: "Bob", region: "EU-DE" });

  const p = (input: Parameters<App["catalog"]["createProduct"]>[0]) => app.catalog.createProduct(input);
  p({
    slug: "tee",
    name: "Classic Tee",
    description: "Soft cotton t-shirt",
    category: "apparel",
    tags: ["cotton", "basics"],
    variants: [
      { sku: "TEE-S", name: "Small", priceCents: 2000, weightGrams: 200 },
      { sku: "TEE-M", name: "Medium", priceCents: 2000, weightGrams: 200 },
      { sku: "TEE-L", name: "Large", priceCents: 2200, weightGrams: 220 },
    ],
  });
  p({
    slug: "hoodie",
    name: "Zip Hoodie",
    description: "Heavyweight fleece hoodie",
    category: "apparel",
    tags: ["fleece"],
    variants: [{ sku: "HOOD-M", name: "Medium", priceCents: 5500, weightGrams: 700 }],
  });
  p({
    slug: "chef-knife",
    name: "Chef Knife",
    description: "8 inch carbon steel chef knife",
    category: "kitchen",
    tags: ["steel"],
    variants: [{ sku: "KNIFE-8", name: "8 inch", priceCents: 8900, weightGrams: 300 }],
  });
  p({
    slug: "pan",
    name: "Cast Iron Pan",
    description: "Pre-seasoned cast iron skillet",
    category: "kitchen",
    tags: ["cast-iron"],
    variants: [
      { sku: "PAN-10", name: "10 inch", priceCents: 3500, weightGrams: 1500 },
      { sku: "PAN-12", name: "12 inch", priceCents: 4500, weightGrams: 2100 },
    ],
  });
  p({
    slug: "novel",
    name: "The Long Checkout",
    description: "A thriller about distributed transactions",
    category: "books",
    tags: ["paperback"],
    variants: [{ sku: "BOOK-NOVEL", name: "Paperback", priceCents: 1500, weightGrams: 400 }],
  });
  p({
    slug: "old-mug",
    name: "Retro Mug",
    description: "Discontinued enamel mug",
    category: "kitchen",
    tags: [],
    active: false,
    variants: [{ sku: "MUG-OLD", name: "Standard", priceCents: 1200, weightGrams: 350 }],
  });

  const stock: Record<string, number> = {
    "TEE-S": 50,
    "TEE-M": 50,
    "TEE-L": 50,
    "HOOD-M": 10,
    "KNIFE-8": 5,
    "PAN-10": 20,
    "PAN-12": 20,
    "BOOK-NOVEL": 100,
    "MUG-OLD": 3,
  };
  for (const [sku, n] of Object.entries(stock)) app.inventory.setStock(sku, n);

  const now = app.clock.now();
  const coupon = (code: string, kind: "percent" | "fixed", value: number, extra: { minSubtotalCents?: number; expiresAt?: number } = {}) =>
    app.repos.coupons.save({
      id: code,
      code,
      kind,
      value,
      minSubtotalCents: extra.minSubtotalCents ?? 0,
      expiresAt: extra.expiresAt ?? null,
      maxRedemptions: null,
      redemptions: 0,
    });
  coupon("SAVE10", "percent", 10);
  coupon("WELCOME5", "fixed", 500, { minSubtotalCents: 2000 });
  coupon("EXPIRED", "percent", 50, { expiresAt: now - 1 });

  return {
    adminId: admin.id,
    adminToken: app.sessions.issue(admin.id).token,
    aliceId: alice.id,
    aliceToken: app.sessions.issue(alice.id).token,
    bobId: bob.id,
    bobToken: app.sessions.issue(bob.id).token,
  };
}
