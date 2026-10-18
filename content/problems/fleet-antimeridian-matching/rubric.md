## Intended approach
Write a failing repro first: a driver at 179.995 and a rider at −179.995, with `dispatcher.dispatch` returning `no_drivers`. Then bisect the pipeline. Does `GridIndex.queryRadius` return the driver? (No: the longitude cell range is clamped to [0, lngCells−1] instead of wrapping.) After fixing that, the repro STILL fails. `rankCandidates` now re-measures distance with a naive equirectangular formula that uses the raw `b.lng − a.lng` (≈ 359.99° → ~38 000 km). The search-radius filter then drops the driver. Fix both. Either wrap the delta in `fastDistanceKm` (keeping the perf idea), or use the index distance. The quote path doesn't pass `pickup`, so quote and dispatch disagree until the matcher is fixed. That inconsistency is a clue.

## Key files
- `src/geo/grid-index.ts` (`queryRadius` lng range, `lngIdx`)
- `src/matching/matcher.ts` (`fastDistanceKm`, `rankCandidates(…, pickup)`)
- `src/matching/dispatcher.ts` (passes `trip.pickup` to the matcher)
- `src/geo/haversine.ts` (`equirectangularKm` already handles the wrap correctly and could be reused)

## Traps
- **Two bugs, one symptom.** Fixing only the grid index makes the quote show a driver while dispatch still says no drivers. A candidate who stops after the first fix fails the hidden tests.
- The antimeridian test was removed from `tests/geo.test.ts` in the same release. The visible suite is green on the starter.
- `lngIdx` was also changed so that 180 folds into the last cell rather than wrapping. That's harmless, but an agent may "fix" it incorrectly.
- Reverting everything to haversine is acceptable, but reusing `equirectangularKm` (which wraps) keeps the perf intent.
- The ETA must be sane (< 400 s), not just "matched": a wrong distance with a widened radius would match but with a huge ETA.

## Strong signals
- Repro test first, and confirms it fails for the stated reason.
- Inspects each stage (index → registry → matcher → dispatcher) with targeted checks instead of reading everything.
- Re-runs the repro after the first fix and catches the second cause.
- Restores or adds the antimeridian regression tests.

## Weak signals
- Lets the agent "fix" by increasing the search radius or special-casing Fiji.
- Rewrites the grid index from scratch.
- Declares victory after the index fix without re-running the end-to-end repro.

## Follow-up questions
- What other code paths in this repo assume longitude doesn't wrap? (Service areas handle it; geohash cells split at 180.) How do surge zones behave on Taveuni?
- How would you have caught this in review or CI? (Property tests: translate the world by 360°; geo fixtures near ±180 and the poles.)
- Was the PERF-88 change worth it? How would you measure whether haversine really dominated?
- The grid degrades near the poles. Is that acceptable? What index would you choose instead (S2, H3)?
