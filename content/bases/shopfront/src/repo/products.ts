import type { Product, Variant } from "../domain/product";
import { InMemoryRepository } from "./memory";

export class ProductRepository extends InMemoryRepository<Product> {
  private skuIndex = new Map<string, string>(); // sku -> productId
  private slugIndex = new Map<string, string>(); // slug -> productId

  constructor() {
    super("product");
  }

  save(product: Product): Product {
    const previous = this.rows.get(product.id);
    if (previous) {
      for (const v of previous.variants) this.skuIndex.delete(v.sku);
      this.slugIndex.delete(previous.slug);
    }
    for (const v of product.variants) this.skuIndex.set(v.sku, product.id);
    this.slugIndex.set(product.slug, product.id);
    return super.save(product);
  }

  delete(id: string): boolean {
    const previous = this.rows.get(id);
    if (previous) {
      for (const v of previous.variants) this.skuIndex.delete(v.sku);
      this.slugIndex.delete(previous.slug);
    }
    return super.delete(id);
  }

  findBySku(sku: string): { product: Product; variant: Variant } | undefined {
    const id = this.skuIndex.get(sku);
    if (!id) return undefined;
    const product = this.get(id)!;
    return { product, variant: product.variants.find((v) => v.sku === sku)! };
  }

  findBySlug(slug: string): Product | undefined {
    const id = this.slugIndex.get(slug);
    return id ? this.get(id) : undefined;
  }

  skuOwner(sku: string): string | undefined {
    return this.skuIndex.get(sku);
  }
}
