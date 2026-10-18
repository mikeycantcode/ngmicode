## Intended approach
Add one `CommandSpec` to the `stringCommands` array in `src/commands/strings.ts`:
`{ name: "GETRANGE", arity: 4, flags: ["readonly"], keys: firstKey, handler }`.
The handler parses both indexes with `parseInteger` before it reads the key. It reads through
`ctx.ks.readAs(key, "string")` (or the local `getString` helper), which applies lazy expiry,
LRU and hit/miss stats and throws WRONGTYPE. It then applies the five clamping steps exactly.
Registration is automatic through `registry.ts`. The candidate should tell the agent so, so the
agent does not invent a second registration.

## Key files
- `src/commands/strings.ts`: where the command goes; `getString` is already there.
- `src/util/numbers.ts`: `parseInteger`. `normalizeRange` is the wrong helper for this command.
- `src/server/dispatcher.ts`: shows that `write` drives WAL logging and `denyoom` drives eviction.
- `src/core/keyspace.ts`: `readAs` / `lookupRead` handle stats.

## Traps
- **Reusing `normalizeRange`.** It implements LRANGE semantics, so `0 -100` gives `""` instead
  of `"H"`. A literal agent told to "reuse the range helper" falls straight into this.
- **Wrong flags.** Copying `APPEND`'s spec (`write`, `denyoom`) makes GETRANGE WAL-logged,
  which hidden test 3 catches.
- **Reading via `ctx.ks.peek`** or another stats-free path means hits and misses are not counted.
- **Missing key returns `null`** instead of `""`.
- **Parsing order.** If the key is read before the indexes are parsed, a missing key with a bad
  index returns `""` instead of the error.
- **Inclusive end.** `slice(start, end)` is off by one.

## Strong signals
- The spec handed to the agent states the five steps in order, names `parseInteger`, says
  explicitly not to use `normalizeRange`, and gives the exact flags array.
- The candidate tells the agent which reading helper to use and why (stats, WRONGTYPE, lazy expiry).
- The candidate checks the agent's diff against the table, by writing quick tests or running the
  examples through `store.exec`.
- The diff is small and touches only `strings.ts`.

## Weak signals
- Prompts like "implement GETRANGE like Redis", which leave the agent to guess.
- The candidate accepts the first diff without running the boundary examples.
- The candidate lets the agent edit unrelated files or add a new helper module.

## Follow-up questions
- Why are rules 1 and 3 different from LRANGE's normalization? What would break if you unified them?
- Lengths here are UTF-16 code units, while real Redis counts bytes. How would `"héllo"` differ, and does it matter for an embedded store?
- Why must a read-only command never appear in the WAL, even though logging it would be harmless on replay?
- How would you implement `SETRANGE`, and what must it log to stay replay-safe?
