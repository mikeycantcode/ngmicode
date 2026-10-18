// Command dispatch: lookup → arity check → MULTI queueing → eviction →
// handler → WAL propagation → stats/events.

import { KvError, OomError, arityError } from "../errors";
import { QUEUED } from "../protocol/reply";
import type { Store } from "../store";
import { ErrorReply } from "../types";
import type { CommandContext, CommandSpec, Reply } from "../types";
import type { Session } from "./session";

/** Commands that run immediately even inside MULTI. */
const TX_CONTROL = new Set(["MULTI", "EXEC", "DISCARD", "WATCH", "UNWATCH"]);

export function arityOk(spec: CommandSpec, argc: number): boolean {
  return spec.arity >= 0 ? argc === spec.arity : argc >= -spec.arity;
}

export class Dispatcher {
  constructor(
    private store: Store,
    private registry: Map<string, CommandSpec>,
  ) {}

  lookup(name: string): CommandSpec | undefined {
    return this.registry.get(name.toUpperCase());
  }

  dispatch(session: Session, argv: string[]): Reply {
    const spec = this.lookup(argv[0]);
    if (!spec) {
      if (session.inMulti) session.multiError = true;
      return new ErrorReply(`ERR unknown command '${argv[0]}'`);
    }
    if (!arityOk(spec, argv.length)) {
      if (session.inMulti) session.multiError = true;
      return new ErrorReply(arityError(spec.name).message);
    }
    if (session.inMulti && !TX_CONTROL.has(spec.name)) {
      session.queue.push(argv);
      return QUEUED;
    }
    return this.execute(session, spec, argv);
  }

  /** Runs a validated command right now (also used by EXEC for queued commands). */
  execute(session: Session, spec: CommandSpec, argv: string[]): Reply {
    const { store } = this;
    const replaying = session.replaying;

    if (!replaying && spec.flags.includes("denyoom") && !store.evictor.ensureBudget()) {
      store.stats.rejectedCommands++;
      return new ErrorReply(new OomError().message);
    }

    const dirtyBefore = store.ks.dirty;
    let propagated: string[][] | null = null;
    const ctx: CommandContext = {
      store,
      ks: store.ks,
      session,
      clock: store.clock,
      replaying,
      rewrite: (...argvs) => {
        propagated = argvs;
      },
    };

    let reply: Reply;
    try {
      reply = spec.handler(ctx, argv.slice(1));
    } catch (e) {
      if (!(e instanceof KvError)) throw e;
      reply = new ErrorReply(e.message);
    }

    store.notifier.flush(spec.name);
    store.stats.countCommand(spec.name);
    if (!replaying && spec.flags.includes("write") && store.ks.dirty !== dirtyBefore) {
      store.wal.appendMany(propagated ?? [[spec.name, ...argv.slice(1)]]);
    }
    store.events.emit("command", { name: spec.name, argv, session, replaying });
    return reply;
  }
}
