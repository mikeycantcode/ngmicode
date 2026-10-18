export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export interface LogLine {
  level: LogLevel;
  msg: string;
  meta?: Record<string, unknown>;
}

/** Captures log lines in memory; handy in tests. */
export class MemoryLogger implements Logger {
  readonly lines: LogLine[] = [];
  constructor(private readonly minLevel: LogLevel = "debug") {}

  debug(msg: string, meta?: Record<string, unknown>) {
    this.push("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.push("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.push("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.push("error", msg, meta);
  }

  messages(level?: LogLevel): string[] {
    return this.lines.filter((l) => !level || l.level === level).map((l) => l.msg);
  }

  private push(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    if (order.indexOf(level) < order.indexOf(this.minLevel)) return;
    if (this.lines.length > 5000) this.lines.shift(); // crude cap
    this.lines.push({ level, msg, meta });
  }
}

export function consoleLogger(prefix = "taskq"): Logger {
  const fmt = (msg: string, meta?: Record<string, unknown>) => `[${prefix}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
  return {
    debug: (m, meta) => console.debug(fmt(m, meta)),
    info: (m, meta) => console.info(fmt(m, meta)),
    warn: (m, meta) => console.warn(fmt(m, meta)),
    error: (m, meta) => console.error(fmt(m, meta)),
  };
}
