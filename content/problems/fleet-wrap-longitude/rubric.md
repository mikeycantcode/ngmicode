## Intended approach
A precise spec dictated to the agent. One canonical way to compute it: `((((lng + 180) % 360) + 360) % 360) - 180`, then map `-0` to `0`. `lngDelta = normalizeLng(to - from)` after validating both inputs. A strong candidate states the formula or the invariants (range, boundary, -0, error message), then asks the agent for a few spot checks. Examples: 180, -180, 540, -360, and 179 → -179.

## Key files
- `src/geo/latlng.ts` (add `normalizeLng`, `lngDelta`)

## Traps
- JS `%` keeps the dividend's sign. A naive `lng % 360` gives a negative remainder for negative input, and `-360 % 360` is `-0`.
- Boundary: 180 must map to -180 (half-open range). Many implementations return 180.
- `-0`: `normalizeLng(-360)`, `normalizeLng(-0)` and `lngDelta(x, x)` can yield `-0`. `toBe(0)` uses Object.is, so tests catch it.
- Error message format must be exact (`invalid longitude: NaN`), and `lngDelta` validates `from` before `to`.
- Penalize a spec that leaves validation, `-0` handling or wrap logic unspecified, even if the result happens to be correct.

## Strong signals
- Gives the agent the target range and the boundary rule explicitly, plus the `-0` rule and the exact error text.
- Asks for (or writes) quick checks at the boundaries before declaring done.
- Keeps the change to the one file, as asked. Doesn't let the agent refactor the existing grid index or haversine.

## Weak signals
- "Write a function to wrap longitude" and accepting the first output.
- Not noticing that 180 vs -180 is a choice the spec makes.
- Several correction rounds caused by under-specification.

## Follow-up questions
- Why a half-open range rather than [-180, 180]? What breaks downstream if both 180 and -180 appear?
- Where in this codebase would `lngDelta` remove duplicated logic? (`equirectangularKm`, grid-index wrap, `destinationPoint`.)
- How do floating-point errors affect `normalizeLng(180.0000000001)`? Should we snap near the boundary?
- How would you test this exhaustively? (Property tests: result in range, `normalizeLng(x + 360k) === normalizeLng(x)`.)
