# concurrency: 3 runs twelve at once

## Incident

The image-resize service runs a single `taskq` worker with
`{ concurrency: 3 }`. Each resize holds about 600 MB, so three at a time is
the most the box can take. Last night a client uploaded a 12-image album, and
the API enqueued all 12 resize jobs together (`Promise.all` over `queue.add`).
The box went OOM. Our metrics showed **12 jobs active at once** on that one
worker.

When jobs trickle in one at a time, the limit holds, and the visible tests
pass.

## Your task

Find out why the worker exceeds its concurrency limit and fix it.

## Acceptance criteria

- A worker never has more than `concurrency` handlers running at once, however
  jobs arrive: bursts, concurrent `add`s, resumes, dependency unblocks or
  retries.
- No lost wake-ups. If a job becomes `waiting` while the worker has a free
  slot, it eventually runs without needing another event to nudge the worker.
- `drained` and rate limiting keep working, and the visible suite stays green.
- Add a regression test that reproduces the burst.

## Notes

You're working with a smaller, older model with limited context. It reads
files in truncated chunks and gets only a few tool steps per turn. Point it at
the right code.
