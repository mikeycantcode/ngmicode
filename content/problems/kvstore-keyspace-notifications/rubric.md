## Intended approach
This touches config, keyspace, dispatcher, store and pub/sub, so it rewards orientation.
1. **Config.** Add a `notify-keyspace-events` param to `PARAMS` in `config.ts` with a validating
   and canonicalizing parser.
2. **"Actually changed".** The keyspace already knows. Every explicit mutation goes through
   `set` / `mutated` / `delete` / `setExpire` / `rename`, which bump `dirty` and versions.
   Expiry and eviction go through `removeEntry` with their own hooks. Add an `onModified(key)`
   hook (or compare per-key versions before and after for `spec.keys(args)`, but versions also
   change on lazy expiry, so that needs care). Collect touched keys while the handler runs.
3. **Publish after the command.** In `Dispatcher.execute`, after the handler, publish one event
   per touched key, named `spec.name.toLowerCase()`. EXEC runs queued commands through
   `execute`, so the transaction semantics come for free. Queueing happens in `dispatch` and
   never reaches the handler.
4. **Expired and evicted.** Extend the store's `onExpired` / `onEvicted` hooks.
5. **Replay and restore.** Suppress everything while `ks.loading` is set (replay and snapshot
   load). Checking `session.replaying` covers WAL replay but not snapshot load.
6. **Publishing.** Use `store.broker.publish(channel, payload)`. It isn't a command, so there is
   no WAL entry and no stats.

## Key files
- `src/config.ts`, `src/commands/server.ts` (CONFIG)
- `src/core/keyspace.ts`: mutators and hooks; `loading`
- `src/server/dispatcher.ts`: execute lifecycle
- `src/store.ts`: hook wiring, `restore`
- `src/pubsub/broker.ts`, `src/server/session.ts` (`drain`)
- `src/commands/transactions.ts`: EXEC → `dispatcher.execute`

## Traps
- **Emitting per command instead of per changed key.** Using `spec.keys(args)` blindly emits for
  `DEL missing`, a failed `SET NX` and so on. Hidden test 1.
- **Version-diff approach catching lazy expiry.** `DEL k` on an expired k changes k's version via
  expiry. That should produce `expired` only, not `del`.
- **Publishing during replay or snapshot load.** Hidden test 3 attaches a subscriber before
  `replay()` and before `Store.restore` with a snapshot.
- **Publishing at queue time** (e.g. from `dispatch`). Hidden test 3 checks nothing arrives
  before EXEC.
- **Logging notifications** by calling `PUBLISH` through the dispatcher, which pollutes stats
  and risks the WAL.
- **Forgetting the active-expiry or eviction path.** Hidden test 2.
- **Config canonicalization and validation.** Hidden test 4.

## Strong signals
- The candidate gets the agent to map the command lifecycle (dispatch → execute → handler → WAL)
  and the mutation funnel *before* designing.
- The candidate chooses a hook at the keyspace mutation layer and explains why
  (single choke point, matches "actually changed").
- The candidate explicitly considers replay, MULTI, expiry and eviction, and tests each.
- The candidate keeps the change additive and small. No handler-by-handler edits across 40 commands.

## Weak signals
- Adding a publish call inside each command handler. That misses commands, and it is the wrong
  layer.
- No test for replay or MULTI.
- Treating the `command` event bus as sufficient without checking which keys changed.

## Follow-up questions
- Redis publishes notifications synchronously inside the command. What happens if a subscriber is slow, and how would you bound that in an embedded store?
- Notifications are fire-and-forget. If the invalidation service disconnects for 5 seconds, it misses events. How would you offer at-least-once delivery?
- Should `expired` be emitted when the key is *logically* expired or when it is *physically* removed? What does your implementation do, and what can a subscriber observe?
- How would you add per-type event classes (Redis's `g$lshzxe` flags) without touching every command?
