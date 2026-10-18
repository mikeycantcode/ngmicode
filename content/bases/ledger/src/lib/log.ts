// Tiny leveled logger. Silent by default so tests stay quiet; app.ts can swap
// in a console-backed sink. TODO(platform-88): replace with the shared
// structured logger once it stops pulling in node built-ins.
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const at = (level: LogLevel) => (msg: string, fields?: Record<string, unknown>) => {
    lines.push(`${level} ${msg}${fields ? " " + JSON.stringify(fields) : ""}`);
  };
  return { lines, debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}
