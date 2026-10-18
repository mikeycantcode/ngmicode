# Longitude wrapping helpers

Our dispatch backend now operates in Fiji, where the service area straddles the 180° meridian.
Several modules need the same two longitude helpers, and we want one well-specified
implementation.

**Your instructions to the agent are graded for precision.** You are
scored on how precisely you specify the behavior, not on how much code you type.

## The ask

Add two exported functions to `src/geo/latlng.ts`. Do not change anything else in that file.
Do not touch other files.

### `normalizeLng(lng: number): number`

- Returns the equivalent longitude in the **half-open** range `[-180, 180)`.
  `180` maps to `-180`. `-180` stays `-180`.
- Works for any finite input, however many turns away it is (for example `540`, `-725`).
- Must never return `-0`. A result of zero is always `+0`.
- Non-finite input (`NaN`, `±Infinity`) throws a `RangeError` with the exact message
  `invalid longitude: <value>`, for example `invalid longitude: NaN`.

### `lngDelta(fromLng: number, toLng: number): number`

- Returns the signed shortest longitudinal difference from `fromLng` to `toLng`, in degrees.
  The result is in `[-180, 180)`. Positive means eastward.
  - `lngDelta(179, -179)` is `2`. `lngDelta(-179, 179)` is `-2`.
  - Points exactly opposite each other give `-180`.
- Same non-finite rule as above. Check `fromLng` first, then `toLng`.

## Notes

- Inputs are plain numbers, not `LatLng` objects. Do not range-check finite input. `lngDelta(0, 900)` is valid.
- Watch the sign behavior of JavaScript's `%` on negative numbers.
