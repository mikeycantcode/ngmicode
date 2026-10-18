// Error classes. The message is exactly what the client sees, including the
// leading error code ("ERR", "WRONGTYPE", ...), matching Redis wording where
// we implement the same command.

export class KvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KvError";
  }

  get code(): string {
    return this.message.split(" ", 1)[0];
  }
}

export class WrongTypeError extends KvError {
  constructor() {
    super("WRONGTYPE Operation against a key holding the wrong kind of value");
    this.name = "WrongTypeError";
  }
}

export class SyntaxError_ extends KvError {
  constructor() {
    super("ERR syntax error");
    this.name = "SyntaxError";
  }
}

export class NotIntegerError extends KvError {
  constructor() {
    super("ERR value is not an integer or out of range");
    this.name = "NotIntegerError";
  }
}

export class NotFloatError extends KvError {
  constructor() {
    super("ERR value is not a valid float");
    this.name = "NotFloatError";
  }
}

export class OomError extends KvError {
  constructor() {
    super("OOM command not allowed when used memory > 'maxmemory'.");
    this.name = "OomError";
  }
}

/** Thrown by the WAL codec / replay. Not a client-facing error. */
export class CorruptLogError extends Error {
  constructor(message: string, readonly index: number) {
    super(message);
    this.name = "CorruptLogError";
  }
}

export function arityError(name: string): KvError {
  return new KvError(`ERR wrong number of arguments for '${name.toLowerCase()}' command`);
}
