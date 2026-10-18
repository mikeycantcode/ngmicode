import { validateProductInput, type Product, type ProductInput, type Variant } from "../domain/product";
import type { Clock } from "../shared/clock";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import type { ProductRepository } from "../repo/products";

export interface VariantPatch {
  sku: string;
  priceCents?: number;
  name?: string;
  weightGrams?: number;
}

export interface ProductPatch {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  active?: boolean;
  variants?: VariantPatch[];
}

interface Deps {
  clock: Clock;
  events: EventBus;
  ids: IdGenerator;
  products: ProductRepository;
}

export class CatalogService {
  constructor(private deps: Deps) {}

  createProduct(input: ProductInput): Product {
    const checked = validateProductInput(input);
    if (!checked.ok) throw new ValidationError("invalid product", checked.error);
    const { products } = this.deps;
    if (products.findBySlug(input.slug)) throw new ConflictError(`slug ${input.slug} is taken`);
    for (const v of input.variants) {
      if (products.skuOwner(v.sku)) throw new ConflictError(`sku ${v.sku} already exists`);
    }
    const now = this.deps.clock.now();
    const product: Product = {
      id: this.deps.ids.next("prod"),
      slug: input.slug,
      name: input.name.trim(),
      description: input.description ?? "",
      category: input.category,
      tags: input.tags ?? [],
      active: input.active ?? true,
      variants: input.variants.map((v) => ({ ...v, attributes: v.attributes ?? {} })),
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    products.save(product);
    this.deps.events.emit({ type: "product.created", productId: product.id });
    return product;
  }

  /** Full replacement (admin PUT). Variants not in the input are removed. */
  replaceProduct(id: string, input: ProductInput): Product {
    const current = this.require(id);
    const checked = validateProductInput(input);
    if (!checked.ok) throw new ValidationError("invalid product", checked.error);
    const { products } = this.deps;
    const slugOwner = products.findBySlug(input.slug);
    if (slugOwner && slugOwner.id !== id) throw new ConflictError(`slug ${input.slug} is taken`);
    for (const v of input.variants) {
      const owner = products.skuOwner(v.sku);
      if (owner && owner !== id) throw new ConflictError(`sku ${v.sku} already exists`);
    }
    const next: Product = {
      ...current,
      slug: input.slug,
      name: input.name.trim(),
      description: input.description ?? "",
      category: input.category,
      tags: input.tags ?? [],
      active: input.active ?? current.active,
      variants: input.variants.map((v) => ({ ...v, attributes: v.attributes ?? {} })),
    };
    return this.commit(current, next);
  }

  /**
   * Partial update (admin PATCH). Variant entries update existing variants by sku;
   * they cannot add or remove variants. `expectedVersion` enables optimistic locking.
   * Validation happens on the merged result, so an invalid patch changes nothing.
   */
  patchProduct(id: string, patch: ProductPatch, expectedVersion?: number): Product {
    const current = this.require(id);
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ConflictError(`product ${id} is at version ${current.version}, not ${expectedVersion}`);
    }
    let variants: Variant[] = current.variants;
    if (patch.variants) {
      const errors: string[] = [];
      const bySku = new Map(current.variants.map((v) => [v.sku, { ...v }]));
      patch.variants.forEach((vp, i) => {
        const v = vp && typeof vp.sku === "string" ? bySku.get(vp.sku) : undefined;
        if (!v) {
          errors.push(`variants[${i}].sku ${vp?.sku} is not a variant of this product`);
          return;
        }
        for (const key of Object.keys(vp)) {
          if (!["sku", "priceCents", "name", "weightGrams"].includes(key)) errors.push(`variants[${i}].${key} is not allowed`);
        }
        if (vp.priceCents !== undefined) v.priceCents = vp.priceCents;
        if (vp.name !== undefined) v.name = vp.name;
        if (vp.weightGrams !== undefined) v.weightGrams = vp.weightGrams;
      });
      if (errors.length) throw new ValidationError("invalid patch", errors);
      variants = current.variants.map((v) => bySku.get(v.sku)!);
    }
    const next: Product = {
      ...current,
      name: patch.name !== undefined ? patch.name : current.name,
      description: patch.description !== undefined ? patch.description : current.description,
      category: patch.category !== undefined ? patch.category : current.category,
      tags: patch.tags !== undefined ? patch.tags : current.tags,
      active: patch.active !== undefined ? patch.active : current.active,
      variants,
    };
    const checked = validateProductInput(next);
    if (!checked.ok) throw new ValidationError("invalid patch", checked.error);
    if (next.variants.some((v) => typeof v.name !== "string" || !v.name)) throw new ValidationError("invalid patch", ["variant name is required"]);
    return this.commit(current, { ...next, name: next.name.trim() });
  }

  setActive(id: string, active: boolean): Product {
    const current = this.require(id);
    return this.commit(current, { ...current, active });
  }

  get(id: string): Product | undefined {
    return this.deps.products.get(id);
  }

  require(id: string): Product {
    const p = this.deps.products.get(id);
    if (!p) throw new NotFoundError(`product ${id} not found`);
    return p;
  }

  /** Public lookup — inactive products are invisible. */
  getPublicBySlug(slug: string): Product {
    const p = this.deps.products.findBySlug(slug);
    if (!p || !p.active) throw new NotFoundError(`product ${slug} not found`);
    return p;
  }

  /** Saves `next`, bumping version/updatedAt and emitting product.updated with the changed keys. */
  protected commit(current: Product, next: Product): Product {
    const changes = diffKeys(current, next);
    if (changes.length === 0) return current;
    const saved: Product = { ...next, version: current.version + 1, updatedAt: this.deps.clock.now() };
    this.deps.products.save(saved);
    this.deps.events.emit({ type: "product.updated", productId: saved.id, changes });
    return saved;
  }
}

const TRACKED: Array<keyof Product> = ["slug", "name", "description", "category", "tags", "active", "variants"];

function diffKeys(a: Product, b: Product): string[] {
  return TRACKED.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
