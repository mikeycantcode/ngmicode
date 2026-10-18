## Intended approach
Spec the change precisely in one pass: widen both overloads to
`number | RangeOptions`; in the implementation, read `step` (default 1) and `end`
from the union; throw `RangeError("range: step cannot be zero (0)!")` for 0; compute
`length = ceilingWithSnap((end - start) / step)`, return `[]` if `length <= 0`;
build with `Array.from({ length }, (_, i) => i === 0 ? start : start + i * step)`.
The snap helper rounds `raw` and uses the rounded value only if
`|raw - round(raw)| / |raw| < 1e-12` (with `raw === 0` returning 0). Strong candidates
walk the agent through `3 / 0.1`, `1e-13` and `-0` before it writes code.

## Key files
- `src/range.ts` (the only source change; `purry` dispatches by argument count)
- `src/range.test.ts` (visible tests, extend)
- `src/purry.ts` (why a third positional param is a bad idea)

## Traps
- **Loop with `i += step`** (the obvious port of the old loop): accumulates float error,
  produces `0.30000000000000004`-style items and, with a negative step, needs a flipped
  comparison. A vague spec lets the agent loop forever on `step: 0`; penalize a spec that leaves the zero-step case unspecified.
- **Plain `Math.ceil`**: `range(0, { end: 3, step: 0.1 })` gets 31 items.
- **Absolute epsilon** (`Math.abs(raw - rounded) < 1e-12`): snaps `range(0, 1e-13)` to `[]`.
  The spec says *relative*; the candidate must pass that word on.
- **`-0` lost**: `start + 0 * step` turns `-0` into `0`. Item 0 must be `start` itself.
- **Inferring step direction** (lodash does): `range(5, 1)` must stay `[]`.
- Forgetting the data-last overload's type, so `range({ end, step })` inside `pipe` breaks.

## Strong signals
- Gives the agent the exact formulae (length, snap, item i) rather than "handle floats".
- Asks for or writes the edge-case tests first: 0 step, wrong direction, `3/0.1`, `1e-13`, `-0`.
- Explains why the step lives in an options object (purry arity dispatch).
- Reads the diff and checks `typeof endOrOptions === "object"` handling in both overloads.

## Weak signals
- Pastes the requirements and accepts the first implementation without running edge cases.
- Lets the agent add a third positional `step` parameter.
- Uses `toBeCloseTo`-style tests that hide the off-by-one length bug.

## Follow-up questions
- Why can't Remeda add `range(start, end, step)` positionally? What does `purry` do with 3 args?
- Why a *relative* tolerance? Give an input where an absolute one is wrong in each direction.
- `start + i * step` vs accumulating: which inputs show the difference?
- Lodash infers a negative step for `range(5, 1)`. Would you? What breaks for existing users?
- How would you make this lazy (an iterator) for very large ranges?
