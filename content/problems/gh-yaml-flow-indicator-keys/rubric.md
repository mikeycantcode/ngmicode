## Intended approach
Find where plain scalars are rendered: `plainString()` in `src/stringify/stringifyString.ts`.
Its first guard quotes the value when `(implicitKey && /[\n[\]{},]/.test(value)) || (inFlow && /[[\]{},]/.test(value))`.
The implicit-key half followed the YAML spec *prose*, which is stricter than the spec's
grammar rules (the maintainer filed an erratum, yaml/yaml-spec#313). The upstream fix
(PR #494) narrows it to `implicitKey && value.includes('\n')` and keeps the `inFlow` check.
A leading flow indicator is still caught by the second regex
(`^[\n\t ,[\]{}#&*!|>'"%@\`]…`). Tests: block-context keys round-trip plain. Flow-context
keys/values with indicators stay quoted and re-parse equal (`YAML.parse(YAML.stringify(x))`).
Add a leading-`[` key case.

## Key files
- `src/stringify/stringifyString.ts` (`plainString`)
- `src/stringify/stringifyPair.ts` (sets `ctx.implicitKey`)
- `tests/doc/stringify.test.ts` (where tests belong)

## Traps
- **Deleting the whole guard.** That includes the `inFlow` half. The visible suite still
  passes, so only the candidate's own tests catch it. `YAML.stringify({ 'a,b': 1 }, { collectionStyle: 'flow' })`
  must stay quoted, or it re-parses as different data.
- **Dropping the newline check** for implicit keys. A multi-line key cannot be implicit.
- **Weak-agent drift.** A small model may "fix" the parser, add a new option such as
  `quoteKeys: false`, or rewrite the second regex. All three are out of scope.
- **Tests that only assert the happy path.** That is a category miss: this is a testing
  problem, so flow-context and round-trip tests are the point.

## Strong signals
- Feeds the agent the exact function and the spec rule, so it does not search blindly.
- Writes the flow-context tests *before* accepting the change, and checks that they would
  fail if the `inFlow` check were removed.
- Uses round-trip assertions (`parse(stringify(x))` equals `x`), not only string snapshots.

## Weak signals
- Accepts a diff that touches the parser or adds options.
- Tests only `foo[{}]: bar`.

## Follow-up questions
- Why is `{` safe in a block implicit key but not inside a flow mapping?
- Which test would have failed if the agent had removed the `inFlow` check too?
- How would you property-test "stringify then parse is the identity" for keys?
- When the spec prose and its grammar disagree, which should an implementation follow?
