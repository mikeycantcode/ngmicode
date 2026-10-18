// MULTI / EXEC / DISCARD / WATCH / UNWATCH.
//
// Semantics (Redis-compatible):
//  - Commands after MULTI are queued, not run. Unknown commands or arity
//    errors while queueing poison the transaction → EXEC returns EXECABORT.
//  - Runtime errors inside EXEC (e.g. WRONGTYPE) do not roll back other
//    commands; the error is just that command's slot in the reply array.
//  - WATCH: if any watched key was modified (written, deleted, expired,
//    evicted, flushed) between WATCH and EXEC — by anyone, including this
//    session — EXEC returns nil and runs nothing.
//  - In the WAL, the writes of one EXEC are wrapped in MULTI ... EXEC so a
//    torn log never replays half a transaction.

import { KvError } from "../errors";
import { OK } from "../protocol/reply";
import type { Session } from "../server/session";
import type { Keyspace } from "../core/keyspace";
import { ErrorReply } from "../types";
import type { CommandContext, CommandSpec, Reply } from "../types";
import { allArgs } from "./common";

function watchedKeysChanged(ks: Keyspace, session: Session): boolean {
  for (const [key, version] of session.watched) {
    ks.expireIfNeeded(key); // an expired key counts as modified
    if (ks.version(key) !== version) return true;
  }
  return false;
}

function exec(ctx: CommandContext): Reply {
  const { session, store, ks } = ctx;
  if (!session.inMulti) throw new KvError("ERR EXEC without MULTI");
  const queue = session.queue;
  const poisoned = session.multiError;
  session.discardMulti();

  if (poisoned) {
    session.unwatchAll();
    return new ErrorReply("EXECABORT Transaction discarded because of previous errors.");
  }
  if (watchedKeysChanged(ks, session)) {
    session.unwatchAll();
    return null;
  }
  session.unwatchAll();

  const walStart = store.wal.length;
  const replies: Reply[] = [];
  for (const argv of queue) {
    const spec = store.dispatcher.lookup(argv[0])!;
    replies.push(store.dispatcher.execute(session, spec, argv));
  }
  if (store.wal.length - walStart > 1) {
    store.wal.insertAt(walStart, ["MULTI"]);
    store.wal.append(["EXEC"]);
  }
  return replies;
}

export const transactionCommands: CommandSpec[] = [
  {
    name: "MULTI",
    arity: 1,
    flags: ["fast"],
    handler: (ctx) => {
      if (ctx.session.inMulti) throw new KvError("ERR MULTI calls can not be nested");
      ctx.session.beginMulti();
      return OK;
    },
  },
  { name: "EXEC", arity: 1, flags: [], handler: exec },
  {
    name: "DISCARD",
    arity: 1,
    flags: ["fast"],
    handler: (ctx) => {
      if (!ctx.session.inMulti) throw new KvError("ERR DISCARD without MULTI");
      ctx.session.discardMulti();
      ctx.session.unwatchAll();
      return OK;
    },
  },
  {
    name: "WATCH",
    arity: -2,
    flags: ["fast"],
    keys: allArgs,
    handler: (ctx, keys) => {
      if (ctx.session.inMulti) throw new KvError("ERR WATCH inside MULTI is not allowed");
      for (const key of keys) {
        if (ctx.session.watched.has(key)) continue;
        ctx.ks.expireIfNeeded(key);
        ctx.session.watched.set(key, ctx.ks.version(key));
      }
      return OK;
    },
  },
  {
    name: "UNWATCH",
    arity: 1,
    flags: ["fast"],
    handler: (ctx) => {
      ctx.session.unwatchAll();
      return OK;
    },
  },
];
