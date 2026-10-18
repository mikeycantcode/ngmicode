export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
}

/**
 * Tiny argv parser: `--a=b`, `--a b`, `--flag`, `--no-flag`, and repeated flags
 * (which become arrays). Everything after `--` is positional.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags: ParsedArgs["flags"] = {};
  const set = (k: string, v: string | boolean) => {
    const prev = flags[k];
    if (prev === undefined || typeof v === "boolean") flags[k] = v;
    else flags[k] = Array.isArray(prev) ? [...prev, v as string] : typeof prev === "string" ? [prev, v as string] : v;
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--") {
      positionals.push(...rest.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) set(body.slice(0, eq), body.slice(eq + 1));
      else if (body.startsWith("no-")) set(body.slice(3), false);
      else if (i + 1 < rest.length && !rest[i + 1].startsWith("--") && VALUE_FLAGS.has(body)) set(body, rest[++i]);
      else set(body, true);
    } else {
      positionals.push(a);
    }
  }
  return { command, positionals, flags };
}

/** Flags that take a value when written as `--flag value` (otherwise they're booleans). */
const VALUE_FLAGS = new Set(["filter", "concurrency", "task", "format", "files"]);

export function flagList(v: ParsedArgs["flags"][string] | undefined): string[] {
  if (v === undefined || typeof v === "boolean") return [];
  return (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
}

export function flagInt(v: ParsedArgs["flags"][string] | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}
