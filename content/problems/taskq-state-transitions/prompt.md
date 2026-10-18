# One choke point for job state changes

## Context

The platform team is building an audit log and a live job-board UI. Both need
a reliable feed of **every** job state change. Today there is no such feed.
Each lifecycle event (`completed`, `waiting`, `stalled`, …) means something
slightly different, and some state changes emit nothing at all.

There is also a correctness problem. The codebase has a state machine, but
several code paths write job state directly and skip it. Last week an
operator ran the admin "promote" tool on a job that was **already running**.
The job went back to `waiting` and ran twice, concurrently.

## Your task

Refactor so that every state change of an existing job goes through **one**
code path. That path:

1. validates the transition against the existing state machine and throws
   `InvalidTransitionError` (which already exists) for illegal moves, leaving
   the job unchanged;
2. performs the write atomically, without losing the lock-ownership and
   compare-and-set protections that exist today;
3. emits exactly **one** new event,
   `"state:changed": { queue, jobId, from, to }`, after the write succeeds.

`state:changed` is not emitted when a job is first created. A job's initial
state (`waiting`, `delayed` or `blocked`) is not a transition.

Also, the admin promote operation must only move **delayed** jobs. For a job
in any other state it throws `InvalidTransitionError` and changes nothing.

## Acceptance criteria

- Every state change emits exactly one `state:changed`. That covers worker
  claims and outcomes, retries (with and without backoff), delayed
  promotion, stall recovery, dependency unblock and cascade failure, DLQ
  replay and admin tools. There are no duplicates and no gaps.
- All existing events keep firing as they do today. Existing consumers
  (metrics, the visible tests) must not notice the refactor.
- The visible test suite passes. Add tests for the new guarantees.

## Non-goals

- Changing the state machine table itself.
- Changing storage adapters' public interface. You may add helpers on top.
