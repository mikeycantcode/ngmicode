## Intended approach

This is a precision exercise. The candidate turns the 10-rule spec into an instruction the literal
agent cannot misread. The reference solution is the original `src/utils/backoff.ts`: validate
attempt, normalise a number to fixed, validate type, delay and jitter, compute the base, cap, apply
jitter with one `rng()` call, then `Math.round`.

Good narration states the order of operations explicitly ("validate attempt before checking for
undefined"), the exact message strings, cap-then-jitter, `Math.round` (not floor or ceil), and the
rng-call rule.

## Key files

- `src/utils/backoff.ts` (stubbed by the overlay)
- `src/worker/lifecycle.ts` (caller, for context only)
- `src/core/types.ts` (`BackoffOptions`)

## Traps

- **Order of validation.** `computeBackoff(0, undefined, rng)` must throw. A natural implementation
  returns 0 early for undefined backoff. Hidden test 3 checks this.
- **Cap vs jitter order.** Jitter before the cap gives `min(9600*0.9, 5000) = 5000` instead of
  4500. Hidden test 2 checks this.
- **Rounding.** `Math.floor` gives 75 instead of 76 for the 101ms case.
- **RNG consumption.** Calling `rng()` unconditionally, even with `jitter: 0`, shifts the seeded
  sequence. Hidden test 2 counts calls.
- **Exponent off-by-one.** `2^attempt` instead of `2^(attempt-1)`.
- **Messages.** The literal agent will invent messages unless given the exact strings.
- Negative numeric shorthand (`-5`) must hit the delay validation message.

## Strong signals

- The candidate writes a single precise instruction or pseudo-code block that covers ordering,
  boundaries and messages before the agent writes code.
- They ask the agent for a small table of example inputs and outputs (including the 101 → 76 case)
  and check it.
- They check that only `backoff.ts` changed.
- They mention why determinism matters (replaying seeded schedules).

## Weak signals

- "Implement exponential backoff with jitter", relying on the agent to guess.
- Accepts the agent's own error messages.
- Doesn't notice the agent added `rng()` calls for logging or debugging.
- Edits callers or tests to fit a wrong implementation.

## Follow-up questions

- Why subtract jitter rather than add it? What does "full jitter" vs "equal jitter" do to
  thundering herds?
- What breaks if two workers share one seeded RNG and interleave calls?
- Should `maxDelay < delay` be an error? What would you specify?
- How would you make backoff respect a `Retry-After` header from the failing dependency?
