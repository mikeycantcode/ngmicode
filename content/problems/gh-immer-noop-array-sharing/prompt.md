# No-op array calls break structural sharing

A React team enabled Immer's **array-methods plugin** (`enableArrayMethods()`) for
its speed-up on large lists. Since then, their profiler shows the whole store
re-rendering on every websocket tick, even when nothing changed.

They traced it to reducers like this:

```js
produce(state, draft => {
  draft.messages.push(...incoming) // `incoming` is usually []
})
```

With the plugin disabled, this returns `state` itself when `incoming` is empty.
With the plugin enabled, it returns a **new** object. Every `useSelector` and
`memo` comparison downstream then misses.

## The ask

Find out why, and fix it. Immer's contract is that a producer which changes nothing
returns the base unchanged (same reference), and emits no patches. Restore that
contract for the plugin's mutating methods.

## Acceptance criteria

With the array-methods plugin enabled, each of these returns the base unchanged and
produces zero patches:

- `push()` / `unshift()` with no arguments (including an empty spread).
- `splice(start, 0)` with nothing inserted, and `splice()` with no arguments.
- `pop()` / `shift()` on an empty array.
- `sort()` / `reverse()` on an array with fewer than two elements.

Also:

- The return values stay native: `push`/`unshift` return the length, `pop`/`shift`
  on an empty array return `undefined`, a no-op `splice` returns `[]`.
- Real mutations behave exactly as before, including their patches.
- Arrays nested **inside a `Set` draft** keep their identity when a no-op call runs
  on them, even if a sibling in the Set was changed.

## Non-goals

Detecting that a `sort()` on a longer array happened to leave the order unchanged.
Changing behavior when the plugin is disabled.
