## Intended approach
Read `src/api/handlers.ts` and find `actingDriverId`, which trusts `body.driverId` for any principal. It is used by the location route AND by `/arrive`, `/start` and `/complete`. Fix the helper once: admin → requires `driverId`; driver → a mismatching `driverId` gives 403; otherwise use `principal.id`. Every caller is then fixed. For H-2, replace the `Number(body.lat)` coercion with the existing strict `parseLatLng` from `validation.ts`. Identity must come from the token: the README states it as a convention.

## Key files
- `src/api/handlers.ts` (`actingDriverId`, location and trip lifecycle routes)
- `src/api/validation.ts` (`parseLatLng` already exists and is strict)
- `src/geo/latlng.ts` (`assertLatLng` in the registry only checks finite and range; `Number(null) === 0` passes)
- `README.md` (Conventions: "API identity comes from the bearer token")

## Traps
- **Second code path:** the report names `/location` and `/complete`, but `/arrive` and `/start` share the same helper or pattern. Patching just the two named routes fails the hidden tests.
- **Don't break ops:** deleting the `driverId` feature entirely breaks the admin on-behalf flow, which is tested.
- **Coercion:** `Number(null)`, `Number("")` and `Number([])` are all `0` and pass the registry's range check. Adding a `Number.isFinite` check doesn't help. The fix is type checking (`typeof === "number"`).
- A weak agent tends to add checks inside `TripService` (which already compares `driverId`). That can't help when the handler passes the victim's id.

## Strong signals
- Asks the agent to list every use of `body.driverId` and `Number(` in the API layer before editing.
- Fixes it centrally in one helper, and reuses `parseLatLng`.
- Writes negative tests per route plus the admin positive case.
- Explains why the service-level check didn't protect anything.

## Weak signals
- Fixes only the URLs in the report.
- Removes admin access from the routes, or the `driverId` feature, breaking FLEET-77.
- Hand-rolls a new validator that still coerces strings.

## Follow-up questions
- What other routes take identities or ownership from client input? How would you audit for that systematically (lint rule, typed principal)?
- Should a mismatching `driverId` be 403 or 400, or silently ignored? What do you leak either way?
- How would you detect that this was exploited in production? (Event log: location jumps, completions by tokens that don't match the trip's driver.)
- Admin on-behalf actions: what audit trail should they leave?
