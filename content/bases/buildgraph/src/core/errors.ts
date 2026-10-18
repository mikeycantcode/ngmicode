/**
 * Error hierarchy for buildgraph. Every error thrown by library code should be a
 * BuildGraphError so the CLI layer can map it to a stable `code` in structured output.
 */
export class BuildGraphError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BuildGraphError";
  }
}

export class SemverError extends BuildGraphError {
  constructor(message: string) {
    super("E_SEMVER", message);
    this.name = "SemverError";
  }
}

export class ManifestError extends BuildGraphError {
  readonly file: string;
  constructor(file: string, message: string) {
    super("E_MANIFEST", `${file}: ${message}`);
    this.file = file;
    this.name = "ManifestError";
  }
}

export class ConfigError extends BuildGraphError {
  constructor(message: string) {
    super("E_CONFIG", message);
    this.name = "ConfigError";
  }
}

export class CycleError extends BuildGraphError {
  /** The cycle as a closed path, e.g. ["a", "b", "a"]. */
  readonly cycle: string[];
  constructor(cycle: string[]) {
    super("E_CYCLE", `Cycle detected: ${cycle.join(" → ")}`);
    this.cycle = cycle;
    this.name = "CycleError";
  }
}

export class ResolveError extends BuildGraphError {
  constructor(message: string) {
    super("E_RESOLVE", message);
    this.name = "ResolveError";
  }
}

export class TaskError extends BuildGraphError {
  readonly taskId: string;
  readonly exitCode: number;
  constructor(taskId: string, exitCode: number, message?: string) {
    super("E_TASK", message ?? `Task ${taskId} failed with exit code ${exitCode}`);
    this.taskId = taskId;
    this.exitCode = exitCode;
    this.name = "TaskError";
  }
}

export class VfsError extends BuildGraphError {
  constructor(message: string) {
    super("E_VFS", message);
    this.name = "VfsError";
  }
}

export function isBuildGraphError(e: unknown): e is BuildGraphError {
  return e instanceof BuildGraphError;
}
