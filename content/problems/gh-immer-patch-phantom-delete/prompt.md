# Phantom remove patches

A collaborative editor syncs state by sending Immer patches
(`enablePatches()`) from the client to the server, which replays them with
`applyPatches`. Customers report that a field occasionally vanishes on the server,
while the client still shows it.

The team narrowed it down to this:

```js
import {produceWithPatches, applyPatches, enablePatches} from "immer"
enablePatches()

const child = {id: 1}
const base = {child, other: 0}

const [next, patches, inverse] = produceWithPatches(base, d => {
  d.child         // read it
  d.child = child // assign the original value back
  d.other = 1
})

next                         // {child: {id: 1}, other: 1}   correct
patches                      // includes {op: "remove", path: ["child"]}
applyPatches(base, patches)  // {other: 1}   <- child is gone
```

## The ask

Find the root cause and fix it.

## Acceptance criteria

- For the recipe above, `patches` is exactly
  `[{op: "replace", path: ["other"], value: 1}]` and `inverse` is exactly
  `[{op: "replace", path: ["other"], value: 0}]`.
- The same holds when the object is nested (`{a: {child, other: 0}}`, editing
  `d.a`): only `["a", "other"]` appears.
- `applyPatches(base, patches)` equals `next`, and `applyPatches(next, inverse)`
  equals `base`.
- `next` itself is unchanged from today.
