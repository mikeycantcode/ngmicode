// Reply helpers and redis-cli style rendering (used by the REPL / debugging).

import { ErrorReply } from "../types";
import type { Reply } from "../types";

export const OK = "OK";
export const QUEUED = "QUEUED";

export function isError(r: Reply): r is ErrorReply {
  return r instanceof ErrorReply;
}

/** Throws if the reply is an error, otherwise returns it. Handy in host code. */
export function unwrap<T extends Reply>(r: T): Exclude<T, ErrorReply> {
  if (r instanceof ErrorReply) throw new Error(r.message);
  return r as Exclude<T, ErrorReply>;
}

/** Renders a reply like redis-cli does. Status replies render like bulk strings here. */
export function formatReply(r: Reply, indent = ""): string {
  if (r === null) return "(nil)";
  if (typeof r === "number") return `(integer) ${r}`;
  if (typeof r === "string") return JSON.stringify(r);
  if (r instanceof ErrorReply) return `(error) ${r.message}`;
  if (r.length === 0) return "(empty array)";
  const width = String(r.length).length;
  return r
    .map((item, i) => {
      const label = `${String(i + 1).padStart(width)}) `;
      const body = formatReply(item, indent + " ".repeat(label.length));
      return (i === 0 ? "" : indent) + label + body;
    })
    .join("\n");
}

/** Flat [k1, v1, k2, v2] → Record. Used for HGETALL / CONFIG GET in host code. */
export function pairsToObject(r: Reply): Record<string, string> {
  if (!Array.isArray(r)) throw new Error("expected array reply");
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < r.length; i += 2) out[String(r[i])] = String(r[i + 1]);
  return out;
}
