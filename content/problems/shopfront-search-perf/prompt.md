# Search at 50k products

We just onboarded a wholesale partner and the catalog went from a few hundred products
to **50,000** (two variants each). The storefront search (`GET /products`) now takes
seconds per request. The p95 alert fires all day, and the busiest moment is a sale, when
thousands of checkouts hold stock at once.

Profiling in staging, three typical requests:

```
GET /products?inStock=true&sort=price_asc&pageSize=24
GET /products?q=steel&category=cat-8
GET /products?tags=sale&minPrice=1000&maxPrice=5000&page=3
```

took about **4 seconds combined** with ~2,000 active reservations. The target is **well under 0.5 s
combined** for those three on the same data.

## Your task

Find out where the time goes and fix it.

## Acceptance criteria

- Results are identical to today's: same filtering, facets, ordering and pagination.
- Results are **never stale**. A product that is deactivated, repriced or sold out (including
  stock held by an active reservation) must be reflected by the very next search.
- Inventory semantics are unchanged: reserve / release / commit / expire must still keep
  `available` and `reserved` correct.
- Existing tests keep passing.

## Notes

- You may change any module. Explain each change and its complexity impact in your final message.
- A previous engineer left a note about why inventory works the way it does. Respect the
  intent behind it, even if you change the mechanism.
