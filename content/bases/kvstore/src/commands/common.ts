// Small helpers shared by command modules.

import { KvError, SyntaxError_ } from "../errors";
import { parseInteger } from "../util/numbers";

/** keys() extractor: the first argument is the only key. */
export const firstKey = (args: string[]): string[] => [args[0]];
/** keys() extractor: every argument is a key (DEL, EXISTS, MGET, WATCH). */
export const allArgs = (args: string[]): string[] => [...args];
/** keys() extractor: key value key value ... (MSET). */
export const everyOther = (args: string[]): string[] => args.filter((_, i) => i % 2 === 0);
/** keys() extractor: first two arguments (RENAME). */
export const firstTwo = (args: string[]): string[] => args.slice(0, 2);

/**
 * Parses a relative TTL argument (EX/PX/EXPIRE/PEXPIRE) into milliseconds.
 * `unit` is "s" or "ms". Rejects non-integers and values that would overflow.
 */
export function parseTtlMs(raw: string, unit: "s" | "ms", command: string): number {
  const n = parseInteger(raw);
  const ms = unit === "s" ? n * 1000 : n;
  if (!Number.isSafeInteger(ms)) throw new KvError(`ERR invalid expire time in '${command.toLowerCase()}' command`);
  return ms;
}

/** Case-insensitive option matcher for parsing trailing flags. */
export function isOpt(arg: string | undefined, name: string): boolean {
  return arg !== undefined && arg.toUpperCase() === name;
}

/** Throws a syntax error unless every remaining arg was consumed. */
export function expectEnd(args: string[], i: number): void {
  if (i < args.length) throw new SyntaxError_();
}
