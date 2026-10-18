# `isDeepEqual` and null-prototype objects

A user parses query strings and JSON with a library that returns objects created with
`Object.create(null)` (no prototype, so `__proto__` and `toString` keys are safe).
Their test does:

```ts
isDeepEqual(parsedQuery, { page: "2", sort: "asc" }); // false, expected true
```

`isDeepEqual` in `src/isDeepEqual.ts` refuses to compare two objects whose prototypes
differ. That rule is deliberate: a `Date` and a look-alike class instance must not be
"equal". But a null-prototype object is just a dictionary, and users expect it to
compare like a plain object literal.

Your instructions to the agent are graded for precision. Specify the change exactly.

## Exact behavior

Two objects have **comparable prototypes** when one of these holds:

1. Their prototypes are the same (`===`). This is today's rule.
2. One prototype is `null` and the other is exactly `Object.prototype`. Check both
   argument orders.

Every other case stays not equal, e.g. a class instance vs `{ a: 1 }`, or a
null-prototype object vs a class instance.

When prototypes are comparable, the existing key-by-key comparison runs unchanged.
That means:

- `isDeepEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 })` → `true`, and
  also with the arguments swapped.
- Nested null-prototype objects compare recursively against nested plain objects.
- Different values still return `false`.
- The data-last form works too: `pipe(data, isDeepEqual(nullProtoObject))`.

## Constraints

- Do not add a parameter or option (e.g. `strict`). `isDeepEqual` is built on `purry`,
  which picks data-first vs data-last from the argument count.
- Update the JSDoc on both overloads to mention the new rule.
- Add tests to `src/isDeepEqual.test.ts`.
