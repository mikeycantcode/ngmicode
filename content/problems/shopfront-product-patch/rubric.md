## Intended approach
Add `CatalogService.patchProduct(id, patch, expectedVersion?)` that validates the patch shape
(the existing `validateBody(..., { strict: true })` covers unknown top-level keys, including slug),
checks `If-Match` against `current.version` (ConflictError → 409), merges variant updates by sku
(unknown sku → ValidationError), re-validates the merged product with `validateProductInput`, and
saves through the existing protected `commit()`. `commit()` already bumps `version`/`updatedAt`,
emits `product.updated` with changed keys and skips no-op writes. The route in `http/routes/admin.ts`
uses the `admin` guard and reads `req.headers["if-match"]`.

For a weak agent, the candidate should split the work (service method → route → tests) and point it
at `commit()`, `validateProductInput`, `validateBody` strict mode and the `ProductInput` shape.

## Key files
- `src/catalog/catalog-service.ts` (`commit`, `replaceProduct` as a model)
- `src/domain/product.ts` (`validateProductInput`)
- `src/http/routes/admin.ts`, `src/http/middleware.ts` (`validateBody` strict, `requireRole`)
- `src/shared/events.ts` (`product.updated` shape)

## Traps
- Writing straight to `repos.products.save()`: no version bump, no event, stale `updatedAt`.
- Accepting `priceCents: 19.99` (float dollars) or `"1999"` strings.
- Letting `slug`/`id`/`version` through (mass assignment), or silently ignoring unknown fields instead of a 400.
- Partially applying an invalid patch (e.g. updating name before discovering a bad sku).
- `If-Match` header case: the router lower-cases header names. Comparing a string header to a number version with `!==`.
- Variant merge that drops `attributes` or replaces the whole variant list.
- Emitting an event or bumping the version on a no-op patch.

## Strong signals
- Reuses `commit()` and the validators instead of re-implementing them.
- Defines the error contract (400 details, 409) before coding, then writes HTTP-level tests for each.
- Catches the weak agent bypassing the service or forgetting the strict option.
- Discusses ETag/If-Match semantics briefly (weak vs strong, header format).

## Weak signals
- One giant prompt to the weak agent, then accepting a half-working result.
- No concurrency test.
- Event/version semantics never checked.

## Follow-up questions
- Why version numbers instead of `updatedAt` timestamps for optimistic locking?
- How would JSON Merge Patch (RFC 7396) or JSON Patch (RFC 6902) change this design? Why not use them here?
- Should PUT also honor `If-Match`? What about clients that never send it?
- A price change should probably reprice open carts. Where would that hook in?
