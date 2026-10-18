# thisArg in filter/find/findLast

With Immer's array-methods plugin enabled (`enableArrayMethods()`), any predicate
that reads `this` breaks:

```js
enableArrayMethods()
const ctx = {min: 3}
produce({items: [1, 2, 3, 4, 5]}, draft => {
  draft.items.filter(function (x) { return x >= this.min }, ctx)
  // TypeError: Cannot read properties of undefined (reading 'min')
})
```

Native arrays, and Immer with the plugin disabled, return `[3, 4, 5]`.

## Where

`src/plugins/arrayMethods.ts`. The plugin hand-rolls `filter`, `find` and
`findLast` to avoid creating proxies. It calls the predicate as a bare function, so
the second argument (`thisArg`) is ignored. Other predicate methods (`findIndex`,
`findLastIndex`, `some`, `every`) fall through to the native method and already work.

## The ask

Your instructions to the agent are graded for precision. Tell it precisely
what to change so `filter`, `find` and `findLast` behave like ECMA-262: the
predicate is called with `this` set to `thisArg` (or `undefined` when omitted), and
receives `(value, index, array)` as today.

## Acceptance criteria

- `filter(fn, ctx)`, `find(fn, ctx)` and `findLast(fn, ctx)` call `fn` with `this === ctx`
  on every invocation.
- Without a `thisArg`, `this` inside a non-arrow predicate is `undefined`.
- Results are unchanged: `filter` still returns drafts for matching items, `find` /
  `findLast` still return the draft of the match, and a recipe that only reads still
  returns the base (`result === base`).
- No other method, file, or behavior changes.
