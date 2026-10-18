# No drivers on Taveuni

**Ticket FLEET-311 (P1), from Fiji Ops:**

> Since Tuesday's release ("matching perf improvements"), riders on Taveuni get *"No drivers
> available"* almost every time. Taveuni sits right on the 180° meridian. Our drivers wait at the
> wharf on the **west** side of the line (lng ≈ 179.99). Riders in town are on the **east** side
> (lng ≈ −179.99), 1–2 km away. Riders on Viti Levu (lng ≈ 178.4) are fine. SF and NYC are fine.
> We tried moving a driver to the east side of the line, and then he got matched.

The release touched several matching files. Nobody remembers exactly what changed.

## The ask

1. Reproduce the bug with a failing test.
2. Find the root cause, or causes, and fix them. Riders and drivers on opposite sides of the
   antimeridian must be matched exactly as if the line weren't there. The pickup ETA must be correct, too.
3. Keep the perf intent of the release where you reasonably can. Don't undo unrelated work.
4. Walk your interviewer through how you narrowed it down.

## Acceptance

- A rider at (−16.80, −179.995) with an idle driver at (−16.80, 179.995) gets matched to that
  driver, and gets a realistic pickup ETA (about 1 km away). The reverse direction works too.
- When several drivers are nearby on both sides of the line, dispatch picks the genuinely
  nearest one. The quote screen's ETA agrees with dispatch's ETA.
- The existing test suite still passes.
