## Intended approach
Reproduce: gus (guest) searches for a term posted in `#general` and gets results. Root cause: `SearchService.search`
was "optimized" to skip the policy for public channels. It checks only membership for non-public channels, which
misses the rule that guests can't read public channels they aren't in. Fix: go back to `access.canRead` (the policy),
memoized per channel. Audit: `ThreadService.getThread` checks only workspace membership ("replies inherit
visibility"). Any workspace member, including a guest, can read any thread by id, including private channels and
DMs, through `chat.replies`. Fix: `access.assertRead(actorId, parent.channelId)`. Other read paths
(`messages.get`, `history`, `reactions.summary`, `typing.list`, `channels.members`) already use
`assertRead`. The candidate should say they checked them.

## Key files
- `src/search/searchService.ts` (reported leak)
- `src/services/threadService.ts` (second hole, unreported)
- `src/policy/permissions.ts`, `src/policy/access.ts` (the single source of truth)
- `src/api/commands.ts` (`chat.replies`, `search.messages`)

## Traps
- Patching search with a guest special case (`if role === "guest"`) instead of using the policy. That duplicates rules, and the next rule change leaks again.
- Over-correcting: requiring channel membership for every search hit. That breaks the legitimate case where members find public channels they haven't joined. A hidden test checks this.
- Missing the thread path. The comment there is a misleading justification, and an agent will usually accept it.
- Returning `forbidden` for private threads instead of `not_found` leaks existence. `assertRead` already handles this.

## Strong signals
- Writes the failing guest-search test first, then asks the agent to enumerate *every* method that returns message content and how each authorizes. Reviews that list critically.
- Reads the misleading comments as claims to verify, not facts.
- Proposes a structural fix: all reads go through `AccessService`, a lint or test that asserts every command calls `assertRead`, or property tests over (role × channel kind × membership).
- Keeps the perf intent: memoizing `canRead` per channel is cheap.

## Weak signals
- Fixes only search, or only what the agent found without directing an audit.
- Accepts "guests can't get message ids" as a mitigation. Ids are sequential and also arrive via notifications and links.

## Follow-up questions
- The search index is shared across the workspace. At scale, would you filter at query time or index per-ACL? What are the trade-offs?
- A user is removed from a private channel. Which caches or derived data (notifications, search snippets, delivered frames) might still expose content?
- How would you test authorization systematically rather than case by case?
- Is `not_found` vs `forbidden` a meaningful defense when ids are sequential? What else would you change?
