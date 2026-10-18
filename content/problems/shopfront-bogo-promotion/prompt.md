# Buy X, get Y free

Marketing's summer campaign is "**Buy 2 tees, get 1 free**" across apparel, and they want to
run it themselves from the admin API without an engineer. Add a new promotion type.

## Promotion shape

```json
{ "id": "summer-b2g1", "kind": "buy_x_get_y", "category": "apparel", "buy": 2, "get": 1,
  "label": "optional", "startsAt": 0, "endsAt": 0 }
```

`buy` and `get` are positive integers, `category` is required, and `label`/`startsAt`/`endsAt`
behave like they do for the existing promotion types.

## Pricing behavior

- All units of products in the promotion's `category` are **pooled across cart lines** (different
  products and variants count together).
- For every complete group of `buy + get` units, `get` units are free. 7 units with buy 2 / get 1 → 2 free.
- The free units are always the **cheapest** units in the pool (by unit price). On a tie, units
  from the line that was added to the cart first are used first.
- A free unit is free at its **list price**: this promotion is applied **before** every other
  promotion. Category percent promotions, volume tiers and coupons then apply to whatever is left,
  following the existing pricing contract.
- The discount appears on the lines whose units were made free, and in the quote's adjustments
  with the promotion's label (default: `Buy 2 get 1 free (apparel)`).

## Admin

`POST /admin/promotions` must accept the new type, reject invalid ones with a 400 (missing
category, non-positive or non-integer `buy`/`get`) and store it. Once active, it applies to every quote and checkout.

## Done means

Customers see the discount in `GET /cart/quote`, are charged correctly at checkout, and the existing
promotion types work exactly as before.
