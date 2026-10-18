# Missing messages when scrolling back

Two customers with busy CI channels report this: "When I scroll up, some bot
messages are just *gone*. If I search for them, they're there." Nobody can
reproduce it by hand. The history pagination tests are thin, with three
hand-written cases.

Your job is to build test infrastructure that finds this class of bug, then
use it to find and fix the bug. Your agent is a small model with limited
context, so plan accordingly.

## 1. Test helpers (`tests/helpers/seed.ts`)

Other teams will reuse these, so the contract is fixed:

```ts
export function seedMessages(
  app: App,
  opts: { channelId: string; authorId: string; count: number; stepMs?: number; text?: (i: number) => string },
): Message[];
```
- Posts `count` top-level messages **through `app.messages.post`**. Never write to the db directly.
- Before **each** post, advance `app.clock` by `stepMs` (default `1000`). With `stepMs: 0`, the messages share a timestamp.
- Text defaults to `` `msg ${i}` `` with `i` starting at 1. If `text` is provided, use `text(i)` with the same 1-based `i`.
- Returns the created messages in posting order.

```ts
export function collectHistory(app: App, actorId: string, channelId: string, pageSize: number): Message[];
```
- Fetches the first page of `app.history.history` with `limit: pageSize`, then follows `nextCursor` until it is `null`.
- Returns every message from every page, concatenated in page order (newest first).
- Throws an `Error` after 1,000 pages, as a guard against cursor loops.

## 2. Tests

Write a pagination test suite with these helpers. It should cover page sizes,
deletions, timestamp patterns, and anything else you think matters.

## 3. Fix

Fix the root cause your tests uncover. Keep the public API and the cursor format
(`c1…`) working.
