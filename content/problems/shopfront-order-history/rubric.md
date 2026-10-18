## Intended approach
Find the existing conventions before writing code: `shared/paging.ts` (`paginate`/`normalizePaging`: 1-based
`page`, `pageSize` default 20, clamped to 100, 400 on invalid values; envelope `{ items, total, page, pageSize }`),
`GET /products` and `GET /admin/orders` (query names `page`/`pageSize`, `queryInt` for parsing), and
`OrderService.list()` (newest first, ties by id descending). The simplest correct design extends
`OrderService.list` with a `customerId` filter and adds a route next to `GET /orders/:id` that maps
items to the summary shape.

## Key files
- `src/http/routes/orders.ts`, `src/checkout/order-service.ts` (`list`)
- `src/shared/paging.ts`, `src/http/middleware.ts` (`queryInt`), `src/http/routes/admin.ts` (example list endpoint)
- `src/repo/stores.ts` (`OrderRepository.findByCustomer`)

## Traps
- Inventing a new pagination style (`limit`/`offset`, 0-based pages, `{ data, nextCursor }`) instead of the house convention.
- No clamp on `pageSize` (500 must become 100) or silently defaulting `page=0` instead of a 400.
- Sorting by `createdAt` only, so ties fall back to insertion order (oldest first) instead of id descending.
- Reusing the admin list without the customer filter (data leak), or returning everyone's orders to admins.
- Returning full orders (internal fields like `reservationId`, `paymentId`) instead of the summary.
- `itemCount` as the number of lines instead of units.
- Status validation missing or hard-coded with a typo; the status list exists in `domain/order.ts`.

## Strong signals
- Asks the agent to find and summarize the existing list-endpoint conventions before implementing.
- Reuses `paginate`/`OrderService.list` rather than duplicating sorting and paging.
- Tests ties, pagination edges (page 2, oversized pageSize, page 0) and ownership.

## Weak signals
- Accepts the agent's first design without comparing it to existing endpoints.
- Only happy-path tests.

## Follow-up questions
- When would you switch this endpoint to cursor pagination? What breaks with offset pagination as orders are created?
- How would you index this in a real database?
- Should the summary include a thumbnail or first item name? How would you avoid N+1 lookups?
- How would you version the response if mobile needs more fields later?
