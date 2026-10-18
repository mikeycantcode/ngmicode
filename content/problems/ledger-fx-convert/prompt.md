# FX conversion: inverse pairs, USD triangulation, stale rates

Treasury loads FX rates from two vendors. One publishes `EUR/USD`, the other
publishes `USD/EUR`. Today `FxService.convert` in `src/services/fxService.ts`
only uses a **direct** pair (ticket LEDG-340). Any other conversion fails with
`NoRateError`, so EUR→JPY is impossible even though EUR/USD and USD/JPY are loaded.

Your instructions to the agent are graded for precision. Delegate this change precisely. The change
should stay inside `src/services/fxService.ts`.

## Required behavior of `convert(m, to, at = now)`

1. If `m.currency === to`, return `m` unchanged.
2. **Usable rate.** For a pair, take the rate with the latest `effectiveAt <= at`
   (as today). A rate is **stale** when `at - effectiveAt > 24h`. A stale rate
   counts as missing. A rate exactly 24h old is still usable.
3. **Leg resolution, from A to B**, in this order:
   a. a usable direct `A/B` rate;
   b. otherwise, the inverse of a usable `B/A` rate (`1 / rate`).
   If a usable direct rate exists, use it even when the inverse pair has a newer rate.
4. **Conversion.** Use a single leg from `m.currency` to `to` when one resolves.
   Otherwise, triangulate through USD: `m.currency → USD` then `USD → to`.
   Each of those two legs is resolved by rule 3. Never triangulate when either
   side is already USD.
5. **Exactness.** Compute with exact rational arithmetic. Round **once**, half-even,
   to the target currency's minor units, at the very end. Never round an
   intermediate USD amount. Account for currency exponents
   (USD 2, JPY 0, KWD 3).
6. **No rate.** If nothing resolves, throw `NoRateError` with message
   `no FX rate for <FROM>-><TO> at <ISO at>` (e.g.
   `no FX rate for EUR->JPY at 2024-01-01T00:00:00.000Z`). Always name the
   **requested** pair, never a USD leg.

## Non-goals

Don't change `setRate`, the repository, or the API layer. `getRate` may keep
its current direct-only behavior.
