# PATCH products safely

Merchandisers edit prices all day from the admin UI. Today the only way to change a
product is `PUT /admin/products/:id`, which replaces the **whole** product. Two people editing
at once silently overwrite each other, and the UI has to resend every variant to fix a typo.

Add **`PATCH /admin/products/:id`** for partial updates.

## Request

JSON body with any subset of:

| field | rules |
|---|---|
| `name` | non-empty string |
| `description` | string |
| `category` | non-empty string |
| `tags` | array of strings (replaces the list) |
| `active` | boolean |
| `variants` | array of `{ sku, priceCents?, name?, weightGrams? }`. Each entry updates the **existing** variant with that sku. It cannot add or remove variants. |

- Any other top-level field is rejected, **including `slug`** (it's part of public URLs) and
  server-managed fields such as `id`, `version` and `createdAt`.
- `priceCents` follows the house money convention (positive integer cents); `weightGrams` is a
  non-negative integer.
- A `variants` entry whose sku doesn't belong to this product is rejected.
- An invalid request changes nothing. Return 400 with the problems listed in `error.details`.

## Concurrency

The client may send an `If-Match` header holding the product `version` it last saw. If it
doesn't match the current version, respond **409** and change nothing. Without the header the
patch applies unconditionally.

## Response & side effects

- 200 with the full updated product.
- A successful change behaves like every other product write: `version` goes up by one,
  `updatedAt` is set, and listeners get the usual update event with the list of changed fields.
  A patch that changes nothing is still a 200, with no version bump and no event.
- Admin only, like the rest of `/admin`.

Shoppers must see the change immediately (`GET /products/:slug`, search).
