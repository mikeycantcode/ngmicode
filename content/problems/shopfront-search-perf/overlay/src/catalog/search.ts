import { minPriceCents, type Product, type ProductSummary } from "../domain/product";
import type { InventoryService } from "../inventory/inventory-service";
import type { ProductRepository } from "../repo/products";
import { paginate, type Page } from "../shared/paging";

export type SearchSort = "relevance" | "price_asc" | "price_desc" | "newest" | "name";

export interface SearchQuery {
  /** Free text. Every whitespace-separated term must match (AND). */
  q?: string;
  category?: string;
  /** Product must carry ALL of these tags. */
  tags?: string[];
  /** Inclusive bounds on the product's lowest variant price. */
  minPriceCents?: number;
  maxPriceCents?: number;
  inStockOnly?: boolean;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
}

export interface SearchResult extends Page<ProductSummary> {
  /**
   * Category -> number of matching products, computed with every filter
   * EXCEPT `category`, so the UI can show counts for sibling categories.
   */
  facets: { categories: Record<string, number> };
}

interface Candidate {
  product: Readonly<Product>;
  score: number;
  fromPriceCents: number;
  inStock: boolean;
}

// Relevance weights per matched term.
const W_NAME = 3;
const W_TAG = 2;
const W_DESCRIPTION = 1;

export function searchProducts(products: ProductRepository, inventory: InventoryService, query: SearchQuery): SearchResult {
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const wantTags = query.tags ?? [];
  const candidates: Candidate[] = [];

  for (const product of products.list()) {
    if (!product.active) continue;
    const score = scoreProduct(product, terms);
    if (score < 0) continue;
    if (wantTags.length && !wantTags.every((t) => product.tags.includes(t))) continue;
    const fromPriceCents = minPriceCents(product);
    if (query.minPriceCents !== undefined && fromPriceCents < query.minPriceCents) continue;
    if (query.maxPriceCents !== undefined && fromPriceCents > query.maxPriceCents) continue;
    const inStock = product.variants.some((v) => inventory.available(v.sku) > 0);
    if (query.inStockOnly && !inStock) continue;
    // guard against the same product showing up twice (SEARCH-112)
    if (candidates.some((c) => c.product.id === product.id)) continue;
    candidates.push({ product, score, fromPriceCents, inStock });
  }

  const categories: Record<string, number> = {};
  const names: string[] = [];
  for (const c of candidates) if (!names.includes(c.product.category)) names.push(c.product.category);
  for (const name of names) categories[name] = candidates.filter((c) => c.product.category === name).length;

  const matched = query.category ? candidates.filter((c) => c.product.category === query.category) : candidates;
  matched.sort(comparator(query.sort ?? (terms.length ? "relevance" : "newest")));

  const page = paginate(matched, query.page, query.pageSize);
  return {
    ...page,
    items: page.items.map(toSummary),
    facets: { categories },
  };
}

/** -1 = does not match. */
function scoreProduct(p: Readonly<Product>, terms: string[]): number {
  if (terms.length === 0) return 0;
  const name = p.name.toLowerCase();
  const description = p.description.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let s = 0;
    if (name.includes(term)) s += W_NAME;
    if (p.tags.includes(term)) s += W_TAG;
    if (description.includes(term)) s += W_DESCRIPTION;
    if (s === 0) return -1;
    score += s;
  }
  return score;
}

function comparator(sort: SearchSort): (a: Candidate, b: Candidate) => number {
  const byId = (a: Candidate, b: Candidate) => (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0);
  const newest = (a: Candidate, b: Candidate) => b.product.createdAt - a.product.createdAt;
  switch (sort) {
    case "price_asc":
      return (a, b) => a.fromPriceCents - b.fromPriceCents || byId(a, b);
    case "price_desc":
      return (a, b) => b.fromPriceCents - a.fromPriceCents || byId(a, b);
    case "newest":
      return (a, b) => newest(a, b) || byId(a, b);
    case "name":
      return (a, b) => (a.product.name < b.product.name ? -1 : a.product.name > b.product.name ? 1 : byId(a, b));
    case "relevance":
    default:
      return (a, b) => b.score - a.score || newest(a, b) || byId(a, b);
  }
}

function toSummary(c: Candidate): ProductSummary {
  return {
    id: c.product.id,
    slug: c.product.slug,
    name: c.product.name,
    category: c.product.category,
    fromPriceCents: c.fromPriceCents,
    inStock: c.inStock,
  };
}
