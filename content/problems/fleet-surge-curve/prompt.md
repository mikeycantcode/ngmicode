# Smoothed surge curve (PRICE-301)

Surge pricing in a zone flaps between recomputes, because the current curve has no memory.
Riders see 1.0x, then 2.5x, then 1.25x within three minutes. Pricing has written a new curve.
Implement it exactly.

**Your agent runs in literal mode.** It does exactly what you say and infers nothing.

## Scope

Rewrite only `computeSurgeBps` in `src/pricing/surge.ts`. Keep its signature:

```ts
computeSurgeBps(demand: number, supply: number, previousBps: Bps = 10_000, maxBps: Bps = 30_000): Bps
```

`SurgeService` already passes the zone's previous value. Do not change `SurgeService`.
Some existing tests in `tests/pricing.test.ts` encode the old curve. Update those tests to
the new behavior. Do not delete them.

## Spec

All multipliers are integer basis points (10 000 = 1.0x).

1. **Validation.** Throw a `RangeError` if:
   - `demand` or `supply` is not a non-negative integer, or
   - `previousBps` or `maxBps` is not an integer ≥ 10 000.
2. **Target.**
   - If `demand < 5`, the target is 10 000.
   - Otherwise, if `supply === 0`, the target is `maxBps`.
   - Otherwise, target = `10 000 + 6 250 × (demand / supply − 1.2)`. Round **down** to a multiple
     of 250, then clamp to `[10 000, maxBps]`.
   - This must be **exact**. Floating-point error must never move a value across a 250 step.
     For example, `demand = 7, supply = 5` gives a target of exactly **11 250**.
3. **Smoothing.** This applies to every target, including the 10 000 cases above.
   - First clamp `previousBps` down to `maxBps` if it is above it.
   - If `|target − previous| < 500`, return `previous` unchanged (dead band).
   - Otherwise move from `previous` toward `target` by **at most 2 500**, and return the result.

## Examples

| demand | supply | previous | max | result |
|---|---|---|---|---|
| 7 | 5 | 10 000 | 30 000 | 11 250 |
| 40 | 10 | 10 000 | 30 000 | 12 500 |
| 40 | 10 | 27 300 | 30 000 | 27 300 |
| 0 | 10 | 20 000 | 30 000 | 17 500 |
