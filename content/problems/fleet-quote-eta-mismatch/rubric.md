## Intended approach
Trace both paths. Dispatch: `Dispatcher.dispatch` → `registry.findAvailableNear` (status `available`, location fresher than `maxLocationAgeMs`, within radius) → `rankCandidates` → `estimatePickupEtaSec` (road factor 1.35, 28 km/h, +60 s overhead, ceil). Quote: a private `nearestCarEtaSec` that scans `registry.list()`. The fix replaces it with `bestCandidate(registry.findAvailableNear(pickup), config.matching)?.etaSec ?? null` and deletes the bespoke code and its constant.

## Key files
- `src/pricing/quote-service.ts` (`nearestCarEtaSec`)
- `src/matching/dispatcher.ts`, `src/matching/matcher.ts`, `src/matching/eta.ts` (source of truth)
- `src/drivers/driver-registry.ts` (`isDispatchable`, `findAvailableNear`)

## Traps
The explanation should list all five reasons:
1. It includes `on_trip` drivers (it only excludes `offline`). The "2 minutes away" car is busy.
2. It ignores location staleness: drivers who stopped pinging still count.
3. It uses a different ETA model: no road factor, 30 km/h vs 28, no pickup overhead.
4. It uses different rounding (`Math.round` vs `Math.ceil`).
5. It is a separate code path that will drift again. Reuse the dispatch functions; don't copy them.

A weak agent typically fixes only the formula (3 and 4) and leaves the candidate filter alone, or the reverse. The hidden tests cover both. Patching constants to "30 → 28" without the overhead and road factor still fails.

## Strong signals
- Gives the agent the specific functions to read (weak model with a short context) instead of "look at the codebase".
- Produces the reason list before any edit, with file and line pointers.
- Reuses `findAvailableNear` + `bestCandidate` rather than re-implementing the filters.
- Verifies with a scenario where a closer busy or stale driver exists.

## Weak signals
- Tweaks constants until one example matches.
- Lets the weak agent read many files at random and lose context.
- Changes `Dispatcher` or `estimatePickupEtaSec` to match the quote, which inverts the source of truth.

## Follow-up questions
- Even after this fix, the quote and the match can disagree. Why? (Time passes, another rider takes the driver, the driver declines.) How would you communicate that in the UI?
- The comment claims the confirm screen is latency-sensitive. Is `findAvailableNear` fast enough? What's its complexity?
- How would you monitor quote-vs-dispatch ETA drift in production?
- Should the quote hold or reserve the driver? What are the trade-offs?
