import { isCents } from "../shared/money";
import { err, ok, type Result } from "../shared/errors";

export interface Variant {
  sku: string;
  name: string;
  priceCents: number;
  weightGrams: number;
  attributes: Record<string, string>;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  active: boolean;
  variants: Variant[];
  createdAt: number;
  updatedAt: number;
  /** Incremented on every successful write. */
  version: number;
}

export interface ProductInput {
  slug: string;
  name: string;
  description?: string;
  category: string;
  tags?: string[];
  active?: boolean;
  variants: Array<Omit<Variant, "attributes"> & { attributes?: Record<string, string> }>;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

export function validateProductInput(input: ProductInput): Result<ProductInput, string[]> {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return err(["body must be an object"]);
  if (typeof input.slug !== "string" || !SLUG_RE.test(input.slug)) errors.push("slug must be kebab-case");
  if (typeof input.name !== "string" || input.name.trim().length === 0) errors.push("name is required");
  if (typeof input.category !== "string" || input.category.length === 0) errors.push("category is required");
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((t) => typeof t !== "string"))) {
    errors.push("tags must be an array of strings");
  }
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    errors.push("at least one variant is required");
  } else {
    const seen = new Set<string>();
    input.variants.forEach((v, i) => {
      if (typeof v.sku !== "string" || !SKU_RE.test(v.sku)) errors.push(`variants[${i}].sku is invalid`);
      else if (seen.has(v.sku)) errors.push(`variants[${i}].sku is duplicated`);
      else seen.add(v.sku);
      if (!isCents(v.priceCents) || v.priceCents <= 0) errors.push(`variants[${i}].priceCents must be a positive integer`);
      if (!Number.isInteger(v.weightGrams) || v.weightGrams < 0) errors.push(`variants[${i}].weightGrams must be a non-negative integer`);
    });
  }
  return errors.length ? err(errors) : ok(input);
}

export function minPriceCents(p: Product): number {
  let min = Infinity;
  for (const v of p.variants) if (v.priceCents < min) min = v.priceCents;
  return min;
}

export function findVariant(p: Product, sku: string): Variant | undefined {
  return p.variants.find((v) => v.sku === sku);
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  fromPriceCents: number;
  inStock: boolean;
}
