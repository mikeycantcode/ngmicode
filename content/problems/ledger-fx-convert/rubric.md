## Intended approach
The candidate breaks the work into small, checkable instructions:
(1) a private `usableRate(base, quote, at)` that applies the 24h staleness rule with an
inclusive boundary; (2) a `resolveLeg(a, b, at)` that returns an exact fraction
`{ num, den }` as BigInts, direct first and inverse second; (3) a `resolve(from, to, at)`
that tries the single leg, then multiplies the fractions of the two USD legs, and only
when neither side is USD; (4) `convert` multiplies by the amount and the exponent
shift, then calls `divRound(num, den, "half-even")` once; (5) the NoRateError message
uses the original pair. They verify with a hand-computed cross example where rounding
per leg differs from rounding once.

## Key files
- `src/services/fxService.ts`
- `src/lib/numeric.ts` (`parseDecimal`, `divRound`; reuse, don't reinvent)
- `src/storage/repos.ts` (`FxRateRepo.findLatest`)

## Traps
- **Rounding per leg**: converting EUR→USD to cents, then USD→JPY. For 1.00 EUR at
  EUR/USD 1.0850 and USD/JPY 150.37, that gives ¥162. Exact math gives ¥163.
- **Float inverse**: `1 / 0.8` in doubles, or `Number(rate)`. Must stay rational.
- **Preferring the newest rate across directions** instead of direct-first.
- **Staleness boundary** (`>` vs `>=`), and staleness applied per leg. A stale direct
  rate must fall through to a fresh inverse.
- **Error message** built inside the USD leg names `EUR->USD`, not the requested pair.
- **Triangulating when one side is USD** (USD→JPY via USD→USD) or recursing forever.

## Strong signals
- Gives the agent the data shape for exact fractions and the formula with the
  exponent shift written out.
- States the precedence and boundary rules as a numbered list. Doesn't leave them to inference.
- Asks for the change in steps and checks each step's output against worked numbers.

## Weak signals
- One big paragraph: "support inverse and cross rates and staleness".
- Lets the agent call `getRate` recursively for the legs and accepts its error messages.
- Doesn't check the rounding-once requirement with a concrete example.

## Follow-up questions
- Why must we round once? Who loses money when we round per leg, and how much over 1M conversions?
- Should staleness be configurable per pair? Where would that live?
- What if both vendors disagree (EUR/USD 1.0850 vs 1/USD/EUR = 1.0861)? Is "direct first" the right policy?
- How would you make cross-rate resolution auditable (which legs were used) for a regulator?
