// Builds the command table. To add a command: write a CommandSpec in the
// module for its data type and it is picked up here automatically.
//
// Flags matter:
//   write    → logged to the WAL when the keyspace changed (dirty counter)
//   denyoom  → eviction runs first; rejected with OOM under noeviction
//   readonly → never logged

import type { CommandSpec } from "../types";
import { hashCommands } from "./hashes";
import { keyCommands } from "./keys";
import { listCommands } from "./lists";
import { pubsubCommands } from "./pubsub";
import { serverCommands } from "./server";
import { stringCommands } from "./strings";
import { transactionCommands } from "./transactions";
import { zsetCommands } from "./zsets";

export const ALL_COMMANDS: CommandSpec[][] = [
  stringCommands,
  keyCommands,
  listCommands,
  hashCommands,
  zsetCommands,
  transactionCommands,
  pubsubCommands,
  serverCommands,
];

export function buildRegistry(extra: CommandSpec[] = []): Map<string, CommandSpec> {
  const map = new Map<string, CommandSpec>();
  for (const spec of [...ALL_COMMANDS.flat(), ...extra]) {
    const name = spec.name.toUpperCase();
    if (map.has(name)) throw new Error(`duplicate command ${name}`);
    map.set(name, spec);
  }
  return map;
}
