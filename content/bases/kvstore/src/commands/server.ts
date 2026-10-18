// Server / admin commands.

import { KvError } from "../errors";
import { OK } from "../protocol/reply";
import type { CommandSpec } from "../types";
import { isOpt } from "./common";

export const serverCommands: CommandSpec[] = [
  {
    name: "PING",
    arity: -1,
    flags: ["fast"],
    handler: (_ctx, args) => {
      if (args.length > 1) throw new KvError("ERR wrong number of arguments for 'ping' command");
      return args.length ? args[0] : "PONG";
    },
  },
  {
    name: "FLUSHALL",
    arity: 1,
    flags: ["write"],
    handler: (ctx) => {
      const n = ctx.ks.flush();
      ctx.store.events.emit("flush", { keys: n });
      return OK;
    },
  },
  {
    name: "INFO",
    arity: -1,
    flags: [],
    handler: (ctx) => {
      const info = ctx.store.info();
      return Object.entries(info)
        .map(([k, v]) => `${k}:${v}`)
        .join("\r\n");
    },
  },
  {
    name: "CONFIG",
    arity: -2,
    flags: ["admin"],
    handler: (ctx, [sub, ...rest]) => {
      if (isOpt(sub, "GET")) {
        if (rest.length !== 1) throw new KvError("ERR wrong number of arguments for 'config|get' command");
        return ctx.store.config.match(rest[0]);
      }
      if (isOpt(sub, "SET")) {
        if (rest.length !== 2) throw new KvError("ERR wrong number of arguments for 'config|set' command");
        ctx.store.config.set(rest[0], rest[1]);
        return OK;
      }
      if (isOpt(sub, "RESETSTAT")) {
        ctx.store.stats.reset();
        return OK;
      }
      throw new KvError(`ERR unknown subcommand '${sub}'. Try CONFIG GET, CONFIG SET, CONFIG RESETSTAT.`);
    },
  },
  {
    name: "SAVE",
    arity: 1,
    flags: ["admin"],
    handler: (ctx) => {
      ctx.store.lastSave = ctx.store.snapshot();
      return OK;
    },
  },
  {
    // Rewrites the WAL to the minimal command list for the current state.
    name: "BGREWRITEAOF",
    arity: 1,
    flags: ["admin"],
    handler: (ctx) => {
      ctx.store.compact();
      return "Background append only file rewriting started";
    },
  },
];
