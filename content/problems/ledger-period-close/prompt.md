# Month-end period close

Our auditors flagged that nothing stops anyone from posting into a month that
finance has already closed and reported. Back-dated manual adjustments
(`postedAt` on `POST /journal/entries`) are a legitimate feature. But once a
month is closed, it has to stay closed.

## The ask

Add **period close** per tenant.

### API
- `POST /periods/close` with body `{ "through": "<ISO timestamp>" }`. This closes
  the tenant's books through that instant, inclusive. It needs a new scope,
  `periods:write`. Full-access keys (`ALL_SCOPES`) should include it.
  Response `200 { "closedThrough": "<ISO>" }`.
- `GET /periods` (scope `reports:read`) returns `{ "closedThrough": "<ISO>" | null }`.

### Service
Expose this on the services object as `services.periods`, with
`close(tenantId, through: number)` and `closedThrough(tenantId): number | null`.

### Rules
- Closing a period in the future (`through > now`) → `400 validation_error`.
- Closes only move forward. Closing through a time at or before the current
  close → `409`.
- After a close, writing **any** journal entry for that tenant with
  `postedAt <= closedThrough` must fail with `409` and error code `period_closed`.
  The message contains `period closed`. A rejected write must leave nothing behind.
- Corrections still work. Reversing an entry from a closed month is allowed,
  because the reversal lands in the open period.
- Closing a period is audited (a `period.closed` event).
- Tenants are independent.

## Out of scope

Re-opening periods, and approval workflows.
