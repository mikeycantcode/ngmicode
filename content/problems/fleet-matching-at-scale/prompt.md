# Batch matching at stadium scale

We're launching **batch dispatch** for stadium events. When a concert lets out, we collect
ride requests for a short window and then assign them all at once. The algorithm is documented
on `BatchDispatcher`.

The load test is failing. A batch of **1 000 requests against 10 000 online drivers** takes
about **6–10 seconds** to flush. The event-ops SLO is **under 1 second** for that size. Ops
says the 10k-driver city is our *smallest* launch market.

## The ask

1. Find where the time actually goes. Show your interviewer the evidence, not a guess.
2. Make `flush()` for that workload finish in well under 1 s.
3. **No behavior change.** Every assignment must be identical to today's, including tie-breaks.
   Matching must still respect driver status, location staleness, the search radius and
   `candidatesPerRequest`.
4. Real-time dispatch (`Dispatcher`) and quotes must keep working and stay correct.

## Notes

- Use a deterministic workload (`SeededRng`). The tests run in a single thread with no
  profiler, but `Date.now()` around a call works fine for timing.
- Drivers ping their location every few seconds. Whatever you build has to stay correct as
  drivers move, go offline, or stop pinging.
