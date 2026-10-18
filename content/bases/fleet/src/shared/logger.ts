export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/** Collects log lines in memory. Default logger in tests and the sandbox. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];

  constructor(private readonly minLevel: LogLevel = "info") {}

  private log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    this.lines.push(`${level.toUpperCase()} ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`);
    // keep memory bounded
    if (this.lines.length > 1000) this.lines.splice(0, this.lines.length - 1000);
  }

  debug(msg: string, ctx?: Record<string, unknown>) {
    this.log("debug", msg, ctx);
  }
  info(msg: string, ctx?: Record<string, unknown>) {
    this.log("info", msg, ctx);
  }
  warn(msg: string, ctx?: Record<string, unknown>) {
    this.log("warn", msg, ctx);
  }
  error(msg: string, ctx?: Record<string, unknown>) {
    this.log("error", msg, ctx);
  }
}

export const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
