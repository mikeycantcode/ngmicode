# Pen-test findings

An external pen test of the shopfront API came back with two high-severity findings:

> **SF-01: Privilege escalation.** We registered a fresh account through the public sign-up
> endpoint and were then able to create a 100%-off coupon through the admin API.
>
> **SF-02: Order data exposure (IDOR).** Signed in as customer A, we could read customer
> B's order (items, totals, region) by changing the id in `GET /orders/:id`.

The tester only had a day. Assume they found **examples** of these bug classes, not
every instance.

## Requirements

- Nobody can become an admin through the public API. A `role` field sent to sign-up
  is ignored: the request still succeeds (201) and the account is a plain customer.
- A customer can only see and act on their **own** orders. For someone else's order, respond
  exactly as if the order didn't exist (404 `not_found`), so ids can't be probed. Admins can
  still view any order.
- Every `/admin/*` endpoint answers **401** to anonymous callers and **403** to signed-in
  non-admins, before doing any work.
- Don't break legitimate flows: customers can still sign up, check out and pay for their own
  orders; admins can still do everything they could before.

## Deliverable

The fixes, plus a short note in your final message listing every vulnerable spot you found
(file and route or function) and how you made sure there are no others.
