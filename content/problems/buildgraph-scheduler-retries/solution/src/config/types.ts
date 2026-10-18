import type { LogLevel } from "../core/logger";

export interface TaskDefinition {
  /**
   * "^build"        -> the `build` task of every workspace dependency
   * "lint"          -> the `lint` task of the same package
   * "@acme/x#build" -> a specific package's task
   */
  dependsOn: string[];
  /** Globs relative to the package dir that feed the cache key. Outputs are always excluded. */
  inputs: string[];
  /** Globs relative to the package dir that are captured into / restored from the cache. */
  outputs: string[];
  /** Env var names whose values feed the cache key. */
  env: string[];
  cache: boolean;
  /** Extra attempts after a failure. Not part of the task hash. */
  retries?: number;
  /** Base retry backoff in ms (doubles per attempt). Not part of the task hash. */
  retryDelayMs?: number;
}

export interface BuildGraphConfig {
  pipeline: Record<string, TaskDefinition>;
  concurrency: number;
  /** Root-relative globs. They feed every task hash, and changing one affects every package. */
  globalDependencies: string[];
  globalEnv: string[];
  cacheDir: string;
  logLevel: LogLevel;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends any[] ? T[K] : DeepPartial<T[K]>) : T[K] };
