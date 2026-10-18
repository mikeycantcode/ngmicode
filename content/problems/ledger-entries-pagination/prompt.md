# Paginate the account entries endpoint

`GET /accounts/:id/entries` returns **every** entry for an account in one
response. Partners launch next month, and some merchant payables already have
tens of thousands of entries. Partner engineers will page through this
endpoint to reconcile, so a page must never repeat or skip an entry.

## The ask

Add cursor pagination to `GET /accounts/:id/entries`.

- Query params: `limit` and `cursor`.
- Response: `{ "data": [...entries], "nextCursor": string | null }`. Each entry
  keeps its current shape.
- Order: oldest first by `postedAt`. Entries with the same `postedAt` come in a
  stable, deterministic order.
- `limit` defaults to the configured default page size (50) and may not exceed
  the configured max (200). It must be an integer ≥ 1. Anything else →
  `400 validation_error`.
- `cursor` is opaque to clients. Pass the previous page's `nextCursor` to get
  the next page. A malformed cursor → `400 validation_error`.
- `nextCursor` is `null` on the last page.
- **Correct under concurrent writes.** Finance posts back-dated adjustments
  while partners are paging. Paging must never return an entry twice or skip
  an entry that existed when paging started.

## Non-goals

Backwards pagination, and filtering by date range. That's next quarter, so
don't paint us into a corner.
