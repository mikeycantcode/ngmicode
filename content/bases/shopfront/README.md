# shopfront

Backend for the Shopfront storefront: catalog, inventory, cart, pricing, checkout,
orders and a small JSON-over-"HTTP" API. Everything is in-memory and synchronous
(the production adapters live in another repo); this package is the domain core
and the request handling.

## Layout

```
src/
  app.ts                  composition root: createApp() wires repos, services, routes
  config.ts               global tunables (TTLs, page sizes, thresholds)
  dev/seed.ts             demo catalog / users / coupons used by the dev console + tests
  shared/
    money.ts              integer-cents helpers (percentOf, bpsOf, formatCents, ...)
    legacy.ts             deprecated float-dollar helpers (CSV import only)
    errors.ts             AppError hierarchy (status + code) and the Result type
    events.ts             DomainEvent union + synchronous EventBus (keeps history)
    clock.ts, ids.ts      injectable clock, deterministic id generator
    paging.ts             1-based pagination helpers
  domain/                 plain types + pure functions (product, customer, order state machine)
  repo/                   InMemoryRepository<T> and entity repositories
  catalog/                CatalogService (create / replace / activate) and product search
  inventory/              stock levels + reservations
  pricing/                rule-based pricing engine: promotions, volume tiers, coupons, tax
  shipping/rates.ts       shipping price calculator
  cart/                   cart model + CartService
  checkout/               CheckoutService (cart -> pending order), OrderService, fake payment gateway
  accounts/               registration, login, session tokens
  http/                   Router, middleware (errors, auth, roles, body validation), routes/*
```

## Conventions

- **Money is integer cents** everywhere (`priceCents`, `totalCents`, ...). Rounding
  is half-up to the nearest cent unless a function says otherwise. Never pass float
  dollars across a module boundary; `shared/legacy.ts` is being retired.
- **Errors**: throw `AppError` subclasses (`ValidationError` 400, `AuthError` 401,
  `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, ...). The
  `errorMapper` middleware turns them into `{ error: { code, message, details? } }`.
- **Repositories clone** on read and write. Mutating an entity you got from a repo
  does nothing until you `save()` it. `scan()` is the no-clone escape hatch for hot
  read paths.
- **Events**: services emit `DomainEvent`s on the `EventBus` after state changes
  (`product.updated`, `order.placed`, ...). Add new event shapes to the union in
  `shared/events.ts`.
- **Time** comes from the injected `Clock`; ids from the injected `IdGenerator`.
  Nothing reads `Date.now()` directly so tests are deterministic.
- **Pagination** is 1-based: `{ items, total, page, pageSize }`, default page size
  20, max 100 (`shared/paging.ts`).

## Pricing

`PricingEngine.quote()` is the single source of truth for what a customer pays:

1. Item-level rules in ascending priority — category promotions (10), then volume
   tiers (20). Each rule discounts a line's *current* net, so discounts compound.
2. Order-level rules — at most one coupon (30) — applied to the goods net left
   after step 1.
3. Shipping (`shipping/rates.ts`), using the final goods net for free-shipping thresholds.
4. Tax by region (`pricing/tax.ts`) on the final goods net. Shipping is not taxed.

## Inventory & orders

`checkout()` reserves stock, prices the cart and creates a `pending` order holding
the reservation. `pay()` charges the card and **commits** the reservation (units leave
`onHand`). Unpaid orders are cancelled by `expirePending()` (cron hits
`POST /admin/maintenance/expire`), which **releases** the reservation. Committed units
only come back via `InventoryService.restock()`.

Order states: `pending → paid → shipped → delivered`, `pending → cancelled`
(see `TRANSITIONS` in `domain/order.ts`).

## Auth

`Authorization: Bearer <token>` (tokens from `POST /accounts/login`). Roles:
`customer`, `admin`. Every `/admin/*` route must use `requireRole("admin")`.
Customers can only see their own orders; other people's orders are a 404.

## HTTP API (summary)

| Method & path | Who |
|---|---|
| `POST /accounts/register`, `POST /accounts/login` | anyone |
| `GET /accounts/me` | signed in |
| `GET /products`, `GET /products/:slug` | anyone |
| `GET/POST/PATCH/DELETE /cart...`, `GET /cart/quote`, `GET /cart/shipping-estimates` | customer |
| `POST /checkout`, `GET /orders/:id`, `POST /orders/:id/pay` | customer |
| `/admin/products`, `/admin/inventory/:sku`, `/admin/orders`, `/admin/coupons`, `/admin/promotions`, `/admin/maintenance/expire` | admin |

## Known debt

- `shipping/rates.ts` is one big switch that grew per carrier contract.
- `formatCents` has no thousands separators (#231).
- No proportional split helper for order-level discounts yet (#318) — blocks refunds.
- Returns are handled manually by support; `RETURN_WINDOW_DAYS` is unused.
- EU VAT on shipping (#412).

## Tests

`tests/*.test.ts` — run them with the IDE's test runner.
