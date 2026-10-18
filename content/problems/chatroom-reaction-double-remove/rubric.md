## Intended approach
Write a test: user A and user B react, then B removes twice, or C removes a reaction C never added. `A`'s reaction
disappears. Trace to `ReactionService.remove`: `users.indexOf(actorId)` is `-1` when the actor hasn't reacted,
and `splice(-1, 1)` removes the **last** element, which is the most recent other reactor. The function also always
emits `reaction.removed` and returns `true`, so other clients apply a decrement for a removal that didn't happen.
That is the count drift. Fix: early-return `false` when the actor isn't in the list (restore the `includes` guard),
and only then remove and emit. Keeping the splice is fine if guarded. Using `filter` is also fine. The perf claim is
negligible either way.

## Key files
- `src/services/reactionService.ts` (`remove`)
- `src/delivery/fanout.ts` (bridge: `reaction.removed` frames)
- `src/api/commands.ts` (`reactions.remove` returns `changed`)

## Traps
- Fixing only the splice index (`if (idx >= 0) splice`) but still emitting the event and returning `true`. The second symptom stays, and a hidden test catches it.
- Blaming the client or adding client-side de-duplication. The server must be idempotent.
- "Fixing" by reverting to `filter` without understanding why the original broke. That's acceptable code, but weak in the explanation.

## Strong signals
- Reproduces with a minimal failing test before touching code. Explains `splice(-1, 1)` semantics precisely.
- Connects the drift symptom to the unconditional event emission and the fan-out.
- Checks `add()` for the symmetric problem (it's fine: it early-returns on duplicates).
- Mentions that the "perf" change had no test coverage for the non-member removal case.

## Weak signals
- Asks the agent to "fix the reactions bug" with no reproduction, and accepts a diff without understanding it.
- Changes tests to match the buggy behavior.

## Follow-up questions
- Why does `splice(-1, 1)` remove the last element? Name another array method with similar negative-index behavior.
- Two remove requests from the same user arrive concurrently on two server instances backed by a real database. How do you keep this idempotent?
- Should `reactions.remove` for a missing reaction return an error or `changed: false`? Argue for one.
- Clients apply `reaction.added`/`removed` as deltas. What would make the protocol resilient to dropped or duplicated frames?
