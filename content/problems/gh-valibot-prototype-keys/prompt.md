# Prototype-named keys slip through object schemas

A security-minded user reported this against **valibot**, our schema validation library:

```ts
const Schema = v.strictObject({ name: v.string() });

v.parse(Schema, { name: 'a', toString: 'b' });
// returns { name: 'a' } — but strictObject must reject unknown keys!

v.parse(Schema, JSON.parse('{"name":"a","__proto__":{"admin":true}}'));
// also passes silently
```

They also found related symptoms in the other object schemas:

- `looseObject` should pass unknown keys through to the output, but an unknown `toString`
  or `valueOf` key is silently **dropped**.
- `objectWithRest(entries, rest)` should validate every unknown key against `rest`, but an
  unknown `hasOwnProperty` key is **never validated**: `{ hasOwnProperty: 'oops' }` passes a
  `number()` rest schema.

You are paired with a smaller coding agent that has a short context window. Guide it.

## The ask

Make object schemas decide "is this input key one of the declared entries?" using **only the
entries the developer declared**, never inherited `Object.prototype` members.

## Acceptance criteria

- `strictObject`: an unknown key named `toString`, `valueOf`, `hasOwnProperty`, `constructor`
  or `__proto__` produces the usual unknown-key issue (`expected: 'never'`, `received: '"<key>"'`).
- `looseObject`: unknown keys like `toString` appear in the output.
- `objectWithRest`: unknown keys like `toString` are validated by the `rest` schema, and
  issues carry the usual `path`.
- A schema that **declares** such a key (`strictObject({ toString: v.string() })`) still works.
- The keys the library already excludes from output for security reasons (`__proto__`,
  `constructor`, `prototype`) **stay excluded** from `looseObject`/`objectWithRest` output,
  and the output object keeps `Object.prototype` as its prototype.
- Every schema keeps identical behavior between its sync and async variant.
- Add regression tests next to the existing ones.

## Non-goals
- Do not change the public types or issue shapes.
- Do not refactor the schemas into a shared implementation.
