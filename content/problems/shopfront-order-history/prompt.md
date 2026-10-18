# Order history endpoint

The mobile team is building the "My orders" screen. Customers can fetch a single order
today, but they can't list their orders.

## The ask

Add `GET /orders`, which returns the **signed-in user's own** orders.

- Newest first.
- Optional `status` query parameter to filter (`?status=paid`). An unknown status is a 400.
- Paginated, following **the same conventions as the rest of this API** (parameter names,
  response envelope, defaults, limits and error behavior). The mobile team already has a
  pagination component built against our other list endpoints.
- Each item is a compact summary, not the full order:

  ```json
  { "id": "ord_0003", "status": "paid", "totalCents": 4517, "itemCount": 3, "createdAt": 1736942400000 }
  ```

  `itemCount` is the total number of units across all lines.
- Anonymous callers get a 401. Admins calling this endpoint see **their own** orders too
  (they already have `/admin/orders` for everyone's).

## Notes

Orders can share a `createdAt` (bulk imports, tests with a fixed clock). The order must still
be deterministic, matching how orders are sorted elsewhere.
