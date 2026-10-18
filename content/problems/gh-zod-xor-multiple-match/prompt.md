# Distinct z.xor() overlap error

`z.xor([...])` is an exclusive union: exactly one option may match. When **several**
options match, the result today is:

```ts
z.xor([z.string(), z.any()]).safeParse("hello").error.issues;
// [{ code: "invalid_union", errors: [], inclusive: false, path: [], message: "Invalid input" }]
```

A user debugged this for an hour. Non-strict objects strip unknown keys, so
`{ name, version }` matched both their `name` and `name + version` shapes. Nothing in the
error pointed at the overlap.

## The ask

When multiple options of a `z.xor()` match:
- The issue gets a new field, `matches: number[]`. These are the indices of **every**
  option that matched, in option order.
- The English message becomes `"Invalid input: more than one option matched"`.
- Everything else on the issue stays: `code: "invalid_union"`, `errors: []`,
  `inclusive: false`, `path`.

Add `matches` to the TypeScript type of the multiple-match issue.

When **zero** options match, nothing changes. `errors` still holds one entry per option,
and the message is still `"Invalid input"`. Regular `z.union()` is unaffected.

## Example

```ts
const name = z.object({ name: z.string() });
const version = name.extend({ version: z.string() });
z.xor([name, version, z.unknown()]).safeParse({ name: "windows", version: "10" });
// issue.matches → [0, 1, 2]
// issue.message → "Invalid input: more than one option matched"
```

## Non-goals
Translating the new message into other locales. Changing which inputs `xor` accepts.
