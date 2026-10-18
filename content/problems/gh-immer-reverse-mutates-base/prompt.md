# reverse() then write mutates the base

Immer's one promise is that `produce(base, recipe)` **never mutates `base`**.
A user reports that it does, once the array-methods plugin is enabled:

```js
import {produce, isDraft, enableArrayMethods, setAutoFreeze} from "immer"
enableArrayMethods()
setAutoFreeze(false)

const obj3 = {id: 3}
const base = [{id: 1}, {id: 2}, obj3]

const next = produce(base, d => {
  d.reverse()
  d[0].id = 99
})

// base is now [{id:1},{id:2},{id:99}], and obj3.id === 99
```

Without `enableArrayMethods()`, the same recipe works. `sort()` shows the same
problem, and the patches from `produceWithPatches` are wrong too.

## The ask

Find the root cause and fix it.

## Acceptance criteria

With the array-methods plugin enabled:

- After `reverse()` or `sort()` on a draft array, reading an element returns a
  **draft** (`isDraft(d[i]) === true`) for draftable values.
- Writing to that element changes only the result. `base` and every object in it
  are untouched.
- `produceWithPatches` patches replay to the result, and inverse patches replay
  back to `base`.
- The plugin's point is to avoid creating proxies. Arrays that were never reordered
  must not pay any new per-read cost beyond a constant check.

## Non-goals

Changing behavior with the plugin disabled. Changing `sort`/`reverse` return values.
