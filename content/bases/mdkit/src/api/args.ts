// Minimal argv parser for the CLI. Supports `--flag`, `--no-flag`,
// `--key value`, `--key=value` and positionals. Unknown flags are errors.

import { UsageError } from "../core/errors";

export type FlagType = "boolean" | "string" | "number";
export type FlagSpec = Record<string, FlagType>;
export type FlagValues = Record<string, string | number | boolean | undefined>;

export interface ParsedArgs {
  positionals: string[];
  flags: FlagValues;
}

export function parseArgs(argv: string[], spec: FlagSpec): ParsedArgs {
  const positionals: string[] = [];
  const flags: FlagValues = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    let name = arg.slice(2);
    let inline: string | undefined;
    const eq = name.indexOf("=");
    if (eq !== -1) {
      inline = name.slice(eq + 1);
      name = name.slice(0, eq);
    }

    if (name.startsWith("no-") && spec[name.slice(3)] === "boolean" && inline === undefined) {
      flags[name.slice(3)] = false;
      continue;
    }

    const type = spec[name];
    if (!type) throw new UsageError(`unknown option --${name}`);

    if (type === "boolean") {
      if (inline !== undefined && inline !== "true" && inline !== "false") {
        throw new UsageError(`--${name} does not take a value`);
      }
      flags[name] = inline === undefined ? true : inline === "true";
      continue;
    }

    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith("--"))) {
      throw new UsageError(`--${name} requires a value`);
    }
    if (type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new UsageError(`--${name} must be a number, got "${value}"`);
      flags[name] = n;
    } else {
      flags[name] = value;
    }
  }

  return { positionals, flags };
}
