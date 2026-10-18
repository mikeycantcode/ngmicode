# Trip receipts endpoint

Riders keep emailing support to ask, "why was I charged $18.25?" The rider app team wants an
itemized receipt endpoint they can render directly, and finance wants it to reconcile to the cent.

## The ask

Add `GET /trips/:id/receipt`. It returns:

```jsonc
{
  "tripId": "trp_000001",
  "status": "completed",          // or "cancelled"
  "currency": "USD",
  "issuedAt": 1704112200000,      // completedAt or cancelledAt
  "lineItems": [
    { "code": "base", "label": "Base fare", "amountCents": 250 },
    // ...
  ],
  "totalCents": 1825
}
```

### Rules

- **Completed trips:** line items in this order, using these codes: `base`, `distance`,
  `time`, `surge`, `minimum_fare`, `booking_fee`, `promo`. Each label is a human-readable string.
- **Cancelled trips** with a cancellation fee: a single `cancellation_fee` item.
- Omit any line item whose amount is 0. Discounts are **negative** amounts.
- The line items must **sum exactly** to `totalCents`, which equals what we charged.
- **No receipt** for trips that haven't been charged (still active, or cancelled for free):
  respond **409** with error code `receipt_unavailable`.
- **Access:** the trip's rider and admins (support) only. Other riders get 403, and so does
  the trip's **driver**: drivers see earnings, not what the rider paid. An unknown trip gets 404.
