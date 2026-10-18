## Intended approach
Read `applyReviver` and `Document.toJS()` first. The reviver runs *after* the JS value is
built, so source text must be recorded during `toJS`. The upstream fix (PR #726) adds
`reviverSources: WeakMap<holder, Map<key, source>>` to `ToJSContext`. It is created only when a
reviver is set. A `setSource(holder, key, scalarOrString)` helper records `Scalar.source`. Each
place that writes a child into a JS container calls it: `addPairToJSMap` (both the Map and
object branches), `YAMLSeq.toJS`, `YAMLSet.toJS`, `YAMLOMap.toJS`, and `mergeValue`. The root uses
the `{ '': res }` holder. `applyReviver` then looks up `sources.get(holder)?.get(key)` and passes
`context` (only setting `source` when known). It also gains a `seen` set, so recursive anchors
do not recurse forever. Raw JSON: the `string` tag's `identify` accepts `JSON.isRawJSON(value)`.
`NodeCreator` treats a raw JSON object as a scalar, not a map. `stringifyString` returns
`value.rawJSON` verbatim. Every `JSON.isRawJSON` call is optional-chained.

## Key files
- `src/doc/applyReviver.ts`, `src/doc/Document.ts` (`toJS`)
- `src/nodes/toJS.ts` (`ToJSContext`)
- `src/nodes/addPairToJSMap.ts`, `src/nodes/YAMLSeq.ts`, `src/nodes/YAMLSet.ts`
- `src/schema/yaml-1.1/merge.ts`, `src/schema/yaml-1.1/omap.ts`
- `src/doc/NodeCreator.ts`, `src/schema/common/string.ts`, `src/stringify/stringifyString.ts`

## Traps
- **Recording sources with the wrong key.** Object holders are keyed by the *stringified* key
  (`stringKey`). Map holders are keyed by the JS key. Sets are keyed by the value itself.
- **Merge keys.** Values copied by `<<` come from the source map's JS object. Their source
  must be looked up from the *source* holder and re-recorded on the target, or merged values
  lose `source`.
- **Infinite recursion.** `- &a { a: *a }` with a reviver overflowed the stack even before this
  change. The hidden test exercises it. A `seen` set is the fix.
- **Second creation path.** `stringify(JSON.rawJSON(x))` and `new Document([]).value.push(raw)`
  go through `NodeCreator`. That path treats any object as a map unless told otherwise.
  Patching only `stringifyString` misses it.
- **Wrong `source`.** Using the CST `srcToken` or the raw YAML (quotes and escapes included)
  instead of `Scalar.source`.
- **Hard dependency on `JSON.rawJSON`.** It throws on older runtimes.
- **Overhead without a reviver.** It should cost nothing when no reviver is set.

## Strong signals
- Has the agent list every place that inserts into a JS container before writing code.
- Writes a small spec of `source` values for maps, seqs, sets, merges, and the root first.
- Checks recursive anchors and `mapAsMap: true`.
- Runs the full visible suite. Adds tests for merge and set cases.

## Weak signals
- Only patches `addPairToJSMap`, so sequences and sets get no `source`.
- Re-parses the YAML text inside the reviver to find the source.
- Accepts the agent's changes without running the reviver test cases.

## Follow-up questions
- Why a `WeakMap` keyed by holder instead of storing `source` on the JS values?
- What should `context.source` be for an alias? For a merged key? Why?
- How would you support `BigInt` revival for `!!int` values that overflow `Number`?
- What does this cost when no reviver is passed? How did you make sure of it?
- Could raw JSON ever produce invalid YAML in a block context? When would quoting be needed?
