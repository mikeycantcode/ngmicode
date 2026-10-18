## Intended approach
Turn the ticket into a precise spec. A strong spec includes the following.
- Signature: `{ name: "ZRANGEBYSCORE", arity: -4, flags: ["readonly"], keys: firstKey }` in `zsetCommands`.
- Bound parsing: **reuse `parseScoreBound`** (already used by ZCOUNT). It handles `(`, `-inf`,
  `+inf` and `inf`, and raises `ERR min or max is not a float`. Bounds are parsed before options.
- Inclusion: use `aboveMin` / `belowMax`.
- Ordering: the set's natural order is (score, member by code unit), which already satisfies the
  tie-break requirement.
- WITHSCORES: the flat array `member, score, member, score…`, with scores formatted by
  `formatDouble` (the same function ZSCORE uses).
- LIMIT: `offset` and `count` both parsed with `parseInteger`. Negative offset → `[]`. Negative
  count → no limit. Offset counts *matching* elements.
- Complexity: binary-search the start position (`SortedSet.lowerBound` with probe
  `{score: min, member: ""}`), skip equal scores when the bound is exclusive, then walk forward
  until `belowMax` fails or `count` is reached. O(log n + offset + m).
- Reads go through `ctx.ks.readAs(key, "zset")`.

## Key files
- `src/commands/zsets.ts`: `parseScoreBound`, `aboveMin`, `belowMax`, `withScores`, the ZCOUNT handler.
- `src/datatypes/sorted-set.ts`: `lowerBound`. There is no index accessor, so a small `at(i)`
  or range helper is a reasonable addition.
- `src/util/numbers.ts`: `formatDouble`, `parseInteger`.

## Traps
- **Score formatting.** `String(score)` happens to work, but `toFixed` or a hand-rolled formatter
  prints `inf` as `Infinity`. Test 2 checks `inf` and `1.5`.
- **Exclusive min with equal scores.** The binary search must skip *all* members with score ==
  min, not only one.
- **LIMIT semantics.** Negative count means all. Negative offset means empty. Offset applies to
  matches, not to absolute ranks. LIMIT with one argument is a syntax error.
- **Bound errors.** A vague spec lets the agent write its own parser, which returns `ERR value is not a valid float`
  instead of ZCOUNT's message.
- **Flags.** Copying ZADD's spec makes the command WAL-logged.
- A full scan with `entries().filter(...)` passes the tests but fails the ticket's explicit
  performance requirement. The grader should penalize it.

## Strong signals
- The spec is written as numbered rules with examples, reusing the existing helpers by name.
- The candidate resolves the ticket's ambiguity explicitly: "stable order" means the
  lexicographic tie-break, and "like ZSCORE" means `formatDouble`.
- The candidate asks for or writes tests for the edge cases: exclusive equal scores, inf bounds,
  LIMIT negatives, and option order.
- The candidate checks the agent's implementation for a full scan and corrects it.

## Weak signals
- "Implement ZRANGEBYSCORE like Redis" with no detail.
- The candidate doesn't mention the existing ZCOUNT helpers, so the agent duplicates parsing.
- No verification of LIMIT or exclusive bounds.

## Follow-up questions
- What is the time complexity of your implementation with `LIMIT 100000 10`? How does Redis avoid paying for the offset, and does it?
- `SortedSet.add` is O(n) because of `splice`. What would you change for a 1M-member set, and what would it cost elsewhere?
- How would you implement keyset pagination ("everything after (score, member)") so pages never skip or repeat under concurrent updates?
- Why does `(` only work as a prefix, and how should `((5` be handled?
