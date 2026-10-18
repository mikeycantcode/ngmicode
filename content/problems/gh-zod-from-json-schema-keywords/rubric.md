## Intended approach
Everything lives in `src/v4/classic/from-json-schema.ts`. The file already has the
pattern to copy. `propertyNames` is enforced by a pre-pipe guard (`checkPropertyNames`)
that inspects the **raw** input before the object schema parses it, and the keyword is
carried into metadata (`extraMeta.propertyNames`) so `toJSONSchema` round-trips it.
There is also a `// TODO: uniqueItems and contains/minContains/maxContains are not
supported` in the array branch.

The real PR (#6535):
1. Generalized `checkPropertyNames` into `checkObjectGuards(objectSchema, { keySchema,
   minProperties, maxProperties })`. It counts own keys of the raw input and pushes
   `too_small` / `too_big` with `origin: "object"` and explicit messages (no locale has an
   object Sizable entry).
2. Added `checkArrayGuards(arraySchema, { uniqueItems, containsSchema, minContains,
   maxContains })`, an identity-transform guard piped into the array schema. Duplicates are
   detected with a canonical JSON key per element (Map lookup, so linear) and reported as
   `custom` at the later index. `contains` counts matches with `containsSchema.safeParse`
   and stops early past `maxContains`.
3. Carried all six keywords into metadata so `toJSONSchema` emits them. It dropped a
   carried subschema that holds a `$ref`, because `$defs` do not travel with it.

## Key files
- `src/v4/classic/from-json-schema.ts` (`convertBaseSchema`, `checkPropertyNames`,
  the metadata carry near the end)
- `src/v4/core/to-json-schema.ts` and `json-schema-processors.ts` (how metadata is emitted)
- `src/v4/classic/tests/from-json-schema.test.ts`

## Traps
- **Validating the parsed output, not the input.** Using `.refine()` on the object or array
  schema runs after parsing. Nested `default`s then fill in properties or items: `{}` with a
  defaulted property passes `minProperties: 1`, and `contains` matches a synthesized
  value. Hidden tests cover both.
- **`__proto__`**: the object parse drops it, so a post-parse count misses it (hidden test).
- **Naive equality**: `JSON.stringify` is key-order sensitive (`{a,b}` vs `{b,a}`), and
  `===` misses structural duplicates. An O(n²) deep-equal works but is slow on large arrays.
- **Breaking `propertyNames`** while refactoring the guard. It must still give
  `invalid_key`.
- **Forgetting the round trip**: enforcement works, but `toJSONSchema` drops the keywords
  (hidden tests check `toMatchObject` on the output).
- Treating `minContains`/`maxContains` without `contains` as meaningful. They only apply
  when `contains` is present.

## Strong signals
- Finds the `propertyNames` guard and the metadata carry first, and tells the agent to
  follow that pattern.
- Spells out raw-input semantics to the agent with a concrete counter-example
  (a defaulted property).
- Writes tests per keyword, including the boundaries (`minContains: 0`, `maxContains`
  exceeded, key-order duplicates).
- Checks complexity of the duplicate detection.

## Weak signals
- Lets the agent bolt `.refine()` onto the converted schema and stops when the simple
  cases pass.
- Never runs `toJSONSchema` on the result.
- Large unreviewed diff across files outside `from-json-schema.ts`.

## Follow-up questions
- Why must these guards run before the pipe instead of as checks on the converted schema?
  What do you give up? (A guard issue aborts, so `minItems` is not co-reported. The
  input-mode JSON Schema loses `default`/`examples`.)
- How does your duplicate detection behave on 20,000 objects? On a cyclic object?
- A carried `contains` holds `{ $ref: "#/$defs/Hit" }`. What happens on the round trip?
- Should `fromJSONSchema` throw on keywords it does not support instead of ignoring them?
