## Intended approach
Break it into pieces the weak agent can handle:
1. **Command.** Add `BLPOP` to `commands/lists.ts` as a normal `write` command (arity -3) whose
   handler is the *non-blocking* half. It validates the timeout, pops from the first non-empty
   key (WRONGTYPE propagates), calls `ctx.rewrite(["LPOP", key])` and returns `[key, value]` or
   null. The sync `exec` path and `MULTI` then work for free.
2. **Waiter registry** (e.g. `server/blocking.ts`). An ordered list of
   `{session, keys, resolve, timer}`. `block()` returns a Promise and arms
   `store.clock.setTimer` when the timeout is > 0. On timeout, remove the waiter and resolve null.
3. **Wake-up point.** After every *top-level* command, i.e. at the end of `Session.exec`
   (which covers a whole EXEC) and skipped during replay, walk the waiters in arrival order.
   Pop for each one whose key has data via `dispatcher.execute(waiterSession, LPOP)`, so the pop
   is logged as `LPOP key` *after* the push. Then resolve. Loop until no progress.
4. **`Session.send`.** Run the command. If it is BLPOP, not in MULTI, and the reply is null,
   park the client.
5. **`close()`** cancels the session's waiters.

## Key files
- `src/server/session.ts`: `send()` already exists as the async hook (README roadmap).
- `src/commands/lists.ts`: pop logic, `mutated` (deletes empty lists).
- `src/server/dispatcher.ts`: WAL logging happens after the handler; `execute` is reusable.
- `src/util/clock.ts`: `setTimer`/`clearTimer`; `ManualClock.advance` fires timers.
- `src/commands/transactions.ts`: EXEC runs queued commands through `dispatcher.execute`.

## Traps
- **Serving inside the push handler** (or from the `command` event during EXEC) before the push
  is logged. The WAL then shows `LPOP` before `RPUSH`, and replay leaves the element in the
  list. Hidden test 2 restores from the WAL.
- **Popping without logging.** Splicing the list directly and resolving means the element
  reappears after restore.
- **Fairness.** Serving the newest waiter first (stack), or giving all elements to one waiter.
  Hidden test 3.
- **Timed-out waiters left registered.** A timed-out waiter consumes a later push into a promise
  nobody awaits. Hidden test 4 checks the element is still in the list.
- **Using `setTimeout`** instead of the injected clock. Tests with `ManualClock` never time out
  and hang until the 2 s test timeout.
- Blocking inside MULTI, or on the sync `exec` path.

## Strong signals
- The candidate splits the work explicitly (command → registry → wake-up → send/close) and
  gives the weak agent the exact file and function for each step.
- The candidate explains *where* in the command lifecycle wake-ups must happen and why
  (after logging, after EXEC).
- The candidate writes async tests with two sessions and `ManualClock`, including a WAL restore check.
- The candidate catches the agent using `setTimeout`, or serving in the wrong place.

## Weak signals
- One giant prompt: "implement BLPOP".
- No durability test.
- Polling (`setInterval` checking the list) instead of event-driven wake-ups.

## Follow-up questions
- Why must wake-ups happen after EXEC rather than after each queued push? What would a client observe otherwise?
- How does this design behave if a host never awaits the promise? Is there a leak?
- Redis serves blocked clients on the key in FIFO order, but a client blocked on several keys can be served from any of them. Is your global FIFO the same? Construct a case where they differ.
- How would `BLMOVE` (pop from one list, push to another) need to be logged to stay replay-safe?
- What happens to blocked clients during `Store.restore`, or when the host replaces the store?
