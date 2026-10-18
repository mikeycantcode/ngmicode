import { searchProducts, type SearchSort } from "../../catalog/search";
import type { Services } from "../../app";
import { ValidationError } from "../../shared/errors";
import type { Router } from "../router";
import { json } from "../types";
import { queryInt } from "../middleware";

const SORTS: SearchSort[] = ["relevance", "price_asc", "price_desc", "newest", "name"];

export function registerProductRoutes(router: Router, s: Services) {
  // GET /products?q=&category=&tags=a,b&minPrice=&maxPrice=&inStock=true&sort=&page=&pageSize=
  router.get("/products", (req) => {
    const q = req.query;
    if (q.sort && !SORTS.includes(q.sort as SearchSort)) throw new ValidationError(`sort must be one of ${SORTS.join(", ")}`);
    const result = searchProducts(s.repos.products, s.inventory, {
      q: q.q,
      category: q.category || undefined,
      tags: q.tags ? q.tags.split(",").filter(Boolean) : undefined,
      minPriceCents: queryInt(q, "minPrice"),
      maxPriceCents: queryInt(q, "maxPrice"),
      inStockOnly: q.inStock === "true",
      sort: q.sort as SearchSort | undefined,
      page: queryInt(q, "page"),
      pageSize: queryInt(q, "pageSize"),
    });
    return json(200, result);
  });

  router.get("/products/:slug", (req) => {
    const product = s.catalog.getPublicBySlug(req.params.slug);
    return json(200, {
      ...product,
      variants: product.variants.map((v) => ({ ...v, available: s.inventory.available(v.sku) })),
    });
  });
}
