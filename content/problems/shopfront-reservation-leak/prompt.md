# Phantom out-of-stock

**Incident #841 (Sev-3).** Since Tuesday's deploy, merchandising has seen popular items
flip to "out of stock" on the storefront for roughly 15 minutes at a time, then come back.
Warehouse counts are correct and no extra orders were placed. Support noticed it lines up
with customers who hit an error at checkout — "insufficient stock" on one item in a big
cart, or a coupon that didn't meet its minimum.

Tuesday's deploy contained a "simplify checkout" refactor and a small inventory
performance change.

## Your task

1. Reproduce the problem (a failing test is the best reproduction).
2. Find the root cause(s). There may be more than one path that leaks stock.
3. Fix it so a failed checkout leaves **every** stock level exactly as it was before the
   attempt, while successful checkouts still hold stock for the pending order.
4. In your final message, give a short write-up: the root causes, why it "healed" after
   about 15 minutes, and how you checked nothing else regressed.

## Constraints

- Keep the reserve-before-price ordering. It is deliberate: we never quote items we cannot sell.
- Do not "fix" it by shortening the reservation TTL.
