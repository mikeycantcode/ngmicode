# Out-of-order jobs on busy queues

## Bug report (from the notifications team)

> We rely on `taskq` running jobs with the same priority in the order we add
> them. For one user, the "order shipped" notification has to come after
> "order confirmed". In production we sometimes see them swapped.
>
> It only happens when the queue is backed up: dozens of jobs waiting, one
> worker with `concurrency: 1`. We could never reproduce it with 3–5 jobs. We
> have also seen a `priority: 3` job run before a pile of `priority: 0` jobs a
> few times.
>
> The visible test suite is green, and so is our own.

## Your task

- Reproduce the problem with a failing test.
- Find the root cause and fix it. Don't paper over the symptom.
- Explain why small queues never showed it.

## Acceptance criteria

- With any backlog size, jobs run in this order: lower `priority` first,
  then the order they were added.
- Retries, delayed promotion and stall recovery keep working. The visible
  suite stays green.
- Add a regression test that would have caught this.
