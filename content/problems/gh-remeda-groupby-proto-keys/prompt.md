# `groupBy` crashes on the key `"toString"`

A support engineer reports this from a customer's tag dashboard:

```ts
groupBy(tags, prop("name"));
// TypeError: items.push is not a function
```

It only happens for some customers. The failing customers have tags named
`"toString"`, `"valueOf"` or `"constructor"`. A teammate tried `countBy` on the same
data and got `{ toString: "function toString() { [native code] }11", ... }` instead of
a number.

You have a **smaller, older agent** for this session. It has a short context window
and limited tool steps per turn.

## The ask

Make Remeda's grouping and counting utilities treat every string key as plain data,
including keys that collide with `Object.prototype` members.

## Acceptance criteria

- `groupBy(data, fn)` groups correctly for keys such as `"toString"`, `"valueOf"`,
  `"constructor"` and `"hasOwnProperty"`. Item order inside each group is input order.
- `countBy(data, fn)` returns correct integer counts for the same keys.
- Any other utility in the library with the same defect is fixed too.
- The returned objects are still ordinary objects: `result.toString()` works,
  `Object.getPrototypeOf(result) === Object.prototype`, and `toStrictEqual` against an
  object literal passes.
- Callbacks that return `undefined` still skip the item. Number and symbol keys still work.
- Existing tests stay green. Add a regression test per fixed function.

## Non-goals

Changing the public types. Changing `indexBy`, `mapToObj` or other functions that only
**assign** keys and never read them back first.
