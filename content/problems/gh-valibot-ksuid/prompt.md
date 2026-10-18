# Add a `ksuid()` validation action

You are working in **valibot**, a schema validation library. Users compose validators like this:

```ts
const Schema = v.pipe(v.string(), v.ulid());
```

Valibot already ships ID validators such as `ulid()`, `nanoid()`, `cuid2()` and `uuid()`.
A user asked for [KSUID](https://github.com/segmentio/ksuid) support (Segment's K-Sortable
Unique IDs, e.g. `0ujsswThIGTUYm2K8FjOOfXtY1K`).

Your instructions to the agent are graded for precision: name the conventions to follow
rather than leaving them implied. Every action in this library follows the same strict shape, and the
existing tests compare action objects with `toStrictEqual`, so "close enough" fails.

## The ask

Add a `ksuid` validation action.

### Format
A valid KSUID is **exactly 27 characters**, each in `A–Z`, `a–z` or `0–9` (base62). Nothing
before or after. Matching is case-sensitive in the sense that both cases are allowed; no other
characters are.

### Public API
- `ksuid()` and `ksuid(message)` where `message` is an `ErrorMessage` (string or function),
  both importable from the package root (`import * as v from 'valibot'; v.ksuid()`).
- A regex constant `KSUID_REGEX`, also importable from the package root, defined next to the
  other ID regexes.
- Exported types `KsuidAction` and `KsuidIssue`.

### Action object
`ksuid(message)` returns an object with **exactly** these keys:
`kind: 'validation'`, `type: 'ksuid'`, `reference: ksuid`, `async: false`, `expects: null`,
`requirement: KSUID_REGEX`, `message` (the argument, `undefined` when omitted) and a `~run` method.

### Behaviour of `~run`
- If the dataset is untyped (an earlier step failed), return it unchanged.
- If the string does not match `KSUID_REGEX`, add an issue with `expected: null`,
  `received` set to the quoted input, `requirement: KSUID_REGEX`, and the label `KSUID`.
  The default message must read `Invalid KSUID: Received "<input>"`.

## Acceptance criteria
- `0ujsswThIGTUYm2K8FjOOfXtY1K` passes. 26 or 28 characters fail. Leading/trailing spaces fail.
  `!` or `@` anywhere fail. Empty string fails.
- Tests for the new action, in the same style as its sibling actions.

## Non-goals
- Do not decode or range-check the timestamp/payload.
- Do not change any other action.
