## Intended approach
Candidate dictates a precise spec: currency check first, trim, a single anchored regex
(`^(-)?(\d{1,3}(,\d{3})+|\d+)(\.(\d+))?$`), a separate fraction-length check that
produces the "too many decimal places" message, string concatenation of
integer + right-padded fraction digits, BigInt (or digit-count) range check, and
normalising -0. They should state the exact error messages, and that they use the
raw untrimmed input.

## Key files
- `src/domain/money.ts` (add `parseAmount`, reuse `money()` and `getCurrency`)
- `src/domain/currency.ts` (exponents)

## Traps
- **Float shortcut**: `Math.round(parseFloat(s) * 100)` passes the easy cases but loses
  precision above 2^53 / 100. It also cannot produce the range error reliably.
- **Message ordering**: `"1.234"` for USD must say "too many decimal places", not
  "invalid amount". A single regex with `\d{1,2}` collapses both cases into one message.
- **JPY**: `"1.5"` must give the decimal-places message, and `"1."` must give "invalid amount".
- **-0**: `Number("-0")` / `-0 * x` yields `-0`. `money()` normalises it, but only
  if the agent routes through `money()`.
- **Trimmed vs raw input** in the message.
- **Range**: digits like `"90071992547409.92"` (USD) exceed MAX_SAFE_INTEGER.

## Strong signals
- Lists the error precedence explicitly (currency → format → decimals → range).
- Gives the agent concrete examples and counter-examples, including comma grouping.
- Tells the agent to route the result through `money()` so the conventions hold.
- Verifies with quick tests of edge inputs.

## Weak signals
- "Parse the string into cents" with no rules; accepts whatever regex the agent invents.
- Allows `parseFloat`/`Number()` arithmetic.
- Doesn't mention the message formats, then fixes them one at a time after failures.

## Follow-up questions
- Why is `Math.round(parseFloat("1.005") * 100)` wrong, and what would it return?
- How would you add locale-aware parsing (e.g. `1.234,56`) without breaking this contract?
- Where should this parsing live: the API layer, the domain, or both? Why?
- What should happen with `"0001.50"`? Did your spec decide that?
