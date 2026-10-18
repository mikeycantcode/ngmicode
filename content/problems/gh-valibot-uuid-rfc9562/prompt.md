# Make `uuid()` follow RFC 9562

You are working in **valibot**, a schema validation library. Its `uuid()` validation
action checks a string against `UUID_REGEX`, exported from `src/regex.ts`.

A user filed this report:

```ts
const Schema = v.pipe(v.string(), v.uuid());

v.is(Schema, 'c1e12793-2e77-0611-874d-a4f9cc727e1e'); // true today. Version 0 does not exist.
v.is(Schema, 'c1e12793-2e77-4611-c74d-a4f9cc727e1e'); // true today. Variant c is not RFC 9562.
```

Today the regex only checks the `8-4-4-4-12` hex shape.

Your instructions to the agent are graded for precision: say exactly what changes and what does not.

## The ask

Change `UUID_REGEX` in `src/regex.ts` so that a string matches only if one of these holds:

1. **A standard UUID.** It has the `8-4-4-4-12` hex shape, and both of these are true:
   - The **version** (first character of the third group) is `1` to `8`.
   - The **variant** (first character of the fourth group) is `8`, `9`, `a` or `b`.
2. **The Nil UUID**: `00000000-0000-0000-0000-000000000000`.
3. **The Max UUID**: `ffffffff-ffff-ffff-ffff-ffffffffffff`.

## Acceptance criteria

- Matching stays case-insensitive. `C1E12793-2E77-4611-874D-A4F9CC727E1E` and the uppercase
  Max UUID are valid.
- Valid: v1, v3, v4, v5, v6, v7 and v8 UUIDs, Nil and Max.
- Invalid: version `0`, `9`, `a`, `f`; variant `0`, `7`, `c`, `f`.
- Invalid: strings that are one character away from Nil or Max, such as
  `00000000-0000-0000-0000-000000000001`, `ffffffff-ffff-ffff-ffff-fffffffffffe` and
  `00000000-0000-0000-ffff-ffffffffffff`.
- The whole string must match. No leading or trailing characters.
- `UUID_REGEX` stays the action's `requirement`, so issues still report it.
- Update the regex's doc comment so the next reader knows about the version, variant and
  special cases.

## Constraints

- Do not change the `uuid` action's signature, issue shape or message handling.
- No other regex in `src/regex.ts` may change.
