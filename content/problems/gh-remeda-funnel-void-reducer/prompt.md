# `funnel` passes a phantom argument

`funnel` is Remeda's building block for debounce/throttle/batching. A team wraps a
refresh function with it, without a reducer:

```ts
async function refresh(options?: RefreshOptions) {
  const { force = false } = options ?? {};
  // ...
}

const debouncedRefresh = funnel(refresh, { triggerAt: "both", minQuietPeriodMs: 250 });
debouncedRefresh.call();
```

`refresh` crashes in production: `options` is not `undefined` as the team expected.
Their logs show `refresh` was called with one argument, an empty string.

The documented contract: **when no `reducer` is given, the executor is called with no
arguments at all.**

## The ask

Find out where the stray argument comes from and fix it. Then explain the root cause
to the interviewer.

## Acceptance criteria

- Without a reducer, the executor receives **zero** arguments on every invocation:
  leading edge, trailing edge, and with `minGapMs`.
- Without a reducer, all of the timing behavior stays the same. Calls during a quiet
  period are still detected, and the trailing-edge invocation still happens.
- With a reducer, behavior is unchanged. The executor receives the reduced value,
  even if that value is `""`, `0`, `false` or `null`.
- Add regression tests for the no-reducer case.

## Non-goals

Changing `funnel`'s public types or options. Changing `debounce`.
