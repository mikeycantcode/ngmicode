# Charged four times on attempts: 3

## Support escalation

> A customer was charged **four times** for one order. Our billing job is
> enqueued with `{ attempts: 3, backoff: 1000 }`, and the payment gateway kept
> returning 502s. We expected at most three charge attempts.
>
> Also, the "we gave up, please update your card" email never went out. The
> handler sends it when `ctx.isLastAttempt` is true on a failure. Was it ever
> true?

One engineer says this is working as designed: "`attempts` is the retry
count, the tests say so." Another says the docs say otherwise.

## Your task

1. Work out what `attempts` is **supposed** to mean in this codebase. Cite the
   evidence you used.
2. Make the runtime behave that way, including what handlers see through
   `ctx.attempt` / `ctx.isLastAttempt`.
3. Bring the tests in line with the contract you settled on. Be ready to
   explain to the interviewer why the existing tests didn't catch this.

## Acceptance criteria

- With `attempts: N`, a handler that always throws is called the number of
  times the contract says. After that the job is terminally failed, and
  dead-lettered when the queue has a DLQ.
- `ctx.isLastAttempt` is true on exactly the try whose failure will not be
  retried.
- The default (`attempts` omitted) behaves as documented.
- The visible test suite passes.
