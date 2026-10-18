# Parse decimal amounts into minor units

The partner dashboard is going to let finance users type amounts like `1,234.56`.
Today the only helper is the deprecated `fromDecimal(value: number, …)` in
`src/domain/money.ts`. It multiplies a float, so `"1.005"` style inputs round
wrong, and it can't reject bad input.

Your instructions to the agent are graded for precision: spell out every edge case.

## The ask

Add an exported function to `src/domain/money.ts`:

```ts
parseAmount(input: string, currency: string): Money
```

It turns a human decimal string into a `Money` in integer minor units of `currency`.
Use the currency's exponent from `domain/currency.ts`: USD 2, JPY 0, KWD 3.

## Required behavior

- Check the currency first. An unsupported currency throws the existing
  `unsupported currency: XXX` error.
- Trim leading and trailing whitespace before parsing.
- An optional single leading `-` is allowed. A leading `+` is not.
- Integer part: one or more digits. It may use comma thousands separators, but
  only in valid groups: 1–3 digits, then groups of exactly 3 (`1,234,567` is ok;
  `12,34` and `1,2345` are not).
- Optional fraction: a `.` followed by **at least one** digit. `.5` and `5.` are invalid.
- More fraction digits than the currency allows throws
  `ValidationError` with message `too many decimal places for <CUR>: "<input>"`.
  For JPY, any fraction counts (e.g. `"1.5"`).
- Anything else throws `ValidationError` with message `invalid amount: "<input>"`.
- In both messages, `<input>` is the **original, untrimmed** string.
- `"-0"` and `"-0.00"` return amount `0`, never `-0`.
- If the result is above `Number.MAX_SAFE_INTEGER` minor units, throw
  `ValidationError` with message `amount out of range: "<input>"`.
- The parse must be exact. No floating-point arithmetic.

Examples: `parseAmount(" 1,234.5 ", "USD")` → `{ amount: 123450, currency: "USD" }`;
`parseAmount("-7", "KWD")` → `-7000`; `parseAmount("12", "JPY")` → `12`.

## Non-goals

Don't change `fromDecimal` or its callers. Don't add locale support (`1.234,56`).
