# Pluggable shipping methods

Ops wants to launch **in-store pickup** next month, and a regional courier after that. Every
new carrier today means another branch in the shipping price calculator, a long `switch`
that grew one contract at a time, plus edits in places that hard-code the list of
methods. We want new methods to be a registration, not a code change across the app.

## The ask

Refactor shipping pricing into a registry of calculators, exposed from the same module
that exports `quoteShipping` today:

```ts
export interface ShippingCalculator {
  method: string;
  isAvailable(region: string): boolean;
  price(input: ShippingInput & { kg: number }): number; // kg = billable kg (rounded up, min 1)
}
export function registerShippingMethod(calc: ShippingCalculator): void;
export function listShippingMethods(region: string): string[];
export function quoteShipping(input: ShippingInput): number; // unchanged contract
```

- `standard`, `express` and `overnight` become calculators registered at startup, in that order.
- `registerShippingMethod` throws a `ConflictError` if the method name is already registered.
- `listShippingMethods(region)` returns the methods available in that region, in registration
  order. It returns an empty list for regions we don't ship to.
- `quoteShipping` for a method that exists but isn't available in the region throws a
  `ValidationError` with the message `<method> shipping is not available in <region>`.
- A registered method must work **everywhere a built-in does**: cart quotes, the shipping
  estimates endpoint and checkout.

## Hard constraint: zero behavior change

Every price, threshold, surcharge and error the built-in methods produce today must be
byte-for-byte identical, including the odd ones. Finance reconciles invoices against these numbers.

## Non-goals

Don't build pickup itself (tests will register their own calculators), and don't change pricing rules.
