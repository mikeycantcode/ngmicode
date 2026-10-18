## Intended approach
Integer arithmetic only: take `Math.abs(cents)`, split into `Math.floor(abs / 100)` and
`abs % 100`, group the dollar string in threes (regex `\B(?=(\d{3})+(?!\d))` or a loop),
`padStart(2, "0")` the cents, and prefix `-` only when `cents < 0`. Guard with
`Number.isInteger` first. A strong candidate states all of this up front to the literal agent,
including the error message text and the `-0` case, then checks the agent's output against the table.

## Key files
- `src/shared/money.ts` (`formatCents` only)
- `tests/pricing.test.ts` has the existing `formatCents` cases ("$12.50", "$0.05") that must keep passing.

## Traps
- `-0 < 0` is false but `Object.is(-0, 0)` is false too; an implementation that checks `Object.is(cents, -0)`/`1/cents` or uses `String(cents).startsWith("-")` can print `-$0.00`.
- Putting the sign after the dollar sign (`$-0.05`) — the old behavior.
- Using `toFixed` on `cents / 100` (float path) or `toLocaleString` (locale-dependent; explicitly banned).
- Forgetting to pad cents (`$0.5`), or grouping the cents digits.
- Not throwing for `NaN`/`Infinity` (`Number.isInteger` handles both), or throwing `TypeError`/`Error` instead of `RangeError`, or a different message.
- Literal agent "helpfully" left alone will not touch other functions — but if the candidate says "clean up money.ts" it will.

## Strong signals
- Gives the agent the full table plus the exact error class and message in one instruction.
- Mentions `-0` and non-integer inputs explicitly before the agent writes code.
- Asks the agent to add/run tests for the table, or runs them themselves.
- Keeps scope to one function.

## Weak signals
- "Make formatCents handle thousands and negatives" with no format specifics, then iterating on agent mistakes.
- Accepts `Intl.NumberFormat` output.
- Never runs the existing tests.

## Follow-up questions
- How would you extend this to EUR (`1.234,56 €`) without turning it into a locale-dependent mess?
- Why is formatting with integer math safer than `(cents / 100).toFixed(2)`? Give a value where they differ.
- What happens above `Number.MAX_SAFE_INTEGER` cents? Would you switch to BigInt?
- Where else should a "money to string" conversion be banned so everyone goes through this function?
