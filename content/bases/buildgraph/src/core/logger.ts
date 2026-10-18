export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface LogLine {
  level: Exclude<LogLevel, "silent">;
  message: string;
  scope?: string;
}

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  child(scope: string): Logger;
}

/** Logger that keeps lines in memory. The CLI flushes `lines` into its text output. */
export class MemoryLogger implements Logger {
  readonly lines: LogLine[];
  constructor(
    private level: LogLevel = "info",
    private scope?: string,
    sink?: LogLine[],
  ) {
    this.lines = sink ?? [];
  }

  private push(level: LogLine["level"], message: string) {
    if (ORDER[level] < ORDER[this.level]) return;
    this.lines.push({ level, message, scope: this.scope });
  }

  debug(msg: string) {
    this.push("debug", msg);
  }
  info(msg: string) {
    this.push("info", msg);
  }
  warn(msg: string) {
    this.push("warn", msg);
  }
  error(msg: string) {
    this.push("error", msg);
  }

  child(scope: string): Logger {
    return new MemoryLogger(this.level, this.scope ? `${this.scope}:${scope}` : scope, this.lines);
  }

  format(): string {
    return this.lines.map((l) => `${l.scope ? `[${l.scope}] ` : ""}${l.level === "info" ? "" : l.level + ": "}${l.message}`).join("\n");
  }
}

export const nullLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return nullLogger;
  },
};
