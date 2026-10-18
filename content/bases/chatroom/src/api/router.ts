import type { App } from "../app";
import { isAppError, RateLimitedError } from "../util/errors";
import type { Logger } from "../util/common";
import type { RateLimiter } from "../ratelimit/rateLimiter";
import { validate, type Infer, type Schema } from "./validation";

export interface ApiRequest {
  command: string;
  actorId: string;
  params?: Record<string, unknown>;
}

export type ApiResponse =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; error: string; message?: string; retryAfterMs?: number };

export interface HandlerContext {
  actorId: string;
  app: App;
}

export interface CommandDef<S extends Schema = Schema> {
  name: string;
  schema: S;
  /** Rate-limit bucket (see config.rateLimits). Defaults to "default". */
  bucket?: string;
  handler: (ctx: HandlerContext, params: Infer<S>) => Record<string, unknown>;
}

export function command<S extends Schema>(def: CommandDef<S>): CommandDef<S> {
  return def;
}

// Command dispatcher: auth -> validate -> rate limit -> handler -> wire format.

export class ApiRouter {
  private commands = new Map<string, CommandDef>();
  private app: App;
  private limiter: RateLimiter;
  private logger: Logger;

  constructor(deps: { app: App; limiter: RateLimiter; logger: Logger }) {
    this.app = deps.app;
    this.limiter = deps.limiter;
    this.logger = deps.logger;
  }

  register(defs: CommandDef<any>[]): void {
    for (const d of defs) {
      if (this.commands.has(d.name)) throw new Error(`duplicate command ${d.name}`);
      this.commands.set(d.name, d);
    }
  }

  get commandNames(): string[] {
    return [...this.commands.keys()].sort();
  }

  handle(req: ApiRequest): ApiResponse {
    const def = this.commands.get(req.command);
    if (!def) return { ok: false, error: "unknown_command", message: `no such command: ${req.command}` };
    if (!req.actorId || !this.app.db.users.has(req.actorId)) return { ok: false, error: "not_authed" };

    const parsed = validate(def.schema, req.params);
    if (!parsed.ok) return { ok: false, error: "invalid_arguments", message: parsed.error };

    const decision = this.limiter.check(req.actorId, def.bucket ?? "default");
    if (!decision.allowed) {
      const e = new RateLimitedError(decision.retryAfterMs);
      return { ok: false, error: e.code, message: e.message, retryAfterMs: e.retryAfterMs };
    }

    try {
      const data = def.handler({ actorId: req.actorId, app: this.app }, parsed.value);
      return { ok: true, ...data };
    } catch (e) {
      if (isAppError(e)) return { ok: false, error: e.code, message: e.message };
      this.logger.log("error", "unhandled error in command", { command: req.command, error: String(e) });
      return { ok: false, error: "internal_error" };
    }
  }
}
