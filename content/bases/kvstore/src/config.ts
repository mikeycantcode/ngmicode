// Runtime configuration (CONFIG GET / CONFIG SET). Every parameter has a
// parser that validates input and a canonical string form.

import { KvError } from "./errors";
import { globMatch } from "./util/glob";
import { EVICTION_POLICIES } from "./core/eviction";

interface ParamSpec {
  default: string;
  /** Returns the canonical value or throws KvError. */
  parse(raw: string): string;
}

function nonNegativeInt(name: string) {
  return (raw: string) => {
    if (!/^\d+$/.test(raw)) throw new KvError(`ERR Invalid argument '${raw}' for CONFIG SET '${name}'`);
    return String(Number(raw));
  };
}

function oneOf(name: string, options: string[]) {
  return (raw: string) => {
    const v = raw.toLowerCase();
    if (!options.includes(v)) throw new KvError(`ERR Invalid argument '${raw}' for CONFIG SET '${name}'`);
    return v;
  };
}

const PARAMS: Record<string, ParamSpec> = {
  maxmemory: { default: "0", parse: nonNegativeInt("maxmemory") },
  "maxmemory-policy": { default: "noeviction", parse: oneOf("maxmemory-policy", EVICTION_POLICIES) },
  "active-expire-samples": { default: "20", parse: nonNegativeInt("active-expire-samples") },
  // Kept for config-file compatibility with v0.x; has no effect since the WAL
  // became an in-memory array.
  appendfsync: { default: "everysec", parse: oneOf("appendfsync", ["always", "everysec", "no"]) },
};

export class Config {
  private values = new Map<string, string>();

  constructor(initial: Record<string, string | number> = {}) {
    for (const [name, spec] of Object.entries(PARAMS)) this.values.set(name, spec.default);
    for (const [name, v] of Object.entries(initial)) this.set(name, String(v));
  }

  get(name: string): string {
    const v = this.values.get(name.toLowerCase());
    if (v === undefined) throw new KvError(`ERR Unknown config parameter '${name}'`);
    return v;
  }

  getNumber(name: string): number {
    return Number(this.get(name));
  }

  set(name: string, raw: string): void {
    const key = name.toLowerCase();
    const spec = PARAMS[key];
    if (!spec) throw new KvError(`ERR Unknown option or number of arguments for CONFIG SET - '${name}'`);
    this.values.set(key, spec.parse(raw));
  }

  /** CONFIG GET <pattern>: flat [name, value, ...] sorted by name. */
  match(pattern: string): string[] {
    const out: string[] = [];
    for (const name of [...this.values.keys()].sort()) {
      if (globMatch(pattern.toLowerCase(), name)) out.push(name, this.values.get(name)!);
    }
    return out;
  }
}
