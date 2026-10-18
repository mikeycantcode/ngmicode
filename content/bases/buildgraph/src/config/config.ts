import { ConfigError } from "../core/errors";
import type { VirtualFS } from "../vfs/vfs";
import { deepMerge, isPlainObject } from "../utils/collections";
import type { WorkspacePackage } from "../workspace/workspace";
import { CONFIG_FILE, DEFAULT_CONFIG, DEFAULT_TASK } from "./defaults";
import type { BuildGraphConfig, DeepPartial, TaskDefinition } from "./types";

const TASK_KEYS = new Set(Object.keys(DEFAULT_TASK));
const TOP_KEYS = new Set(Object.keys(DEFAULT_CONFIG));
const LOG_LEVELS = new Set(["debug", "info", "warn", "error", "silent"]);

/**
 * Resolution order (later wins): built-in defaults < buildgraph.json < `overrides`
 * (CLI flags). Pipeline tasks are merged per task, and each task is filled from
 * DEFAULT_TASK. Arrays replace, they never concatenate.
 */
export function loadConfig(fs: VirtualFS, overrides: DeepPartial<BuildGraphConfig> = {}): BuildGraphConfig {
  let fromFile: unknown = {};
  const text = fs.tryRead(CONFIG_FILE);
  if (text !== undefined) {
    try {
      fromFile = JSON.parse(text);
    } catch (e) {
      throw new ConfigError(`${CONFIG_FILE}: invalid JSON (${(e as Error).message})`);
    }
    if (!isPlainObject(fromFile)) throw new ConfigError(`${CONFIG_FILE}: must be an object`);
  }
  return resolveConfig(fromFile as DeepPartial<BuildGraphConfig>, overrides);
}

export function resolveConfig(
  fromFile: DeepPartial<BuildGraphConfig>,
  overrides: DeepPartial<BuildGraphConfig> = {},
): BuildGraphConfig {
  for (const k of Object.keys(fromFile)) {
    if (!TOP_KEYS.has(k)) throw new ConfigError(`${CONFIG_FILE}: unknown key "${k}"`);
  }
  // A pipeline declared in the file replaces the default pipeline entirely; tasks
  // are not inherited from DEFAULT_CONFIG.pipeline.
  const base: BuildGraphConfig = { ...DEFAULT_CONFIG, pipeline: fromFile.pipeline ? {} : DEFAULT_CONFIG.pipeline };
  const merged = deepMerge(deepMerge(base, fromFile), overrides) as BuildGraphConfig;
  const pipeline: Record<string, TaskDefinition> = {};
  for (const [task, def] of Object.entries(merged.pipeline ?? {})) {
    pipeline[task] = normalizeTask(task, def as Partial<TaskDefinition>);
  }
  const cfg = { ...merged, pipeline };
  validate(cfg);
  return cfg;
}

function normalizeTask(task: string, def: Partial<TaskDefinition>): TaskDefinition {
  if (!isPlainObject(def)) throw new ConfigError(`pipeline.${task} must be an object`);
  for (const k of Object.keys(def)) {
    if (!TASK_KEYS.has(k)) throw new ConfigError(`pipeline.${task}: unknown key "${k}"`);
  }
  const out = { ...DEFAULT_TASK, ...def };
  for (const k of ["dependsOn", "inputs", "outputs", "env"] as const) {
    if (!Array.isArray(out[k]) || !out[k].every((x) => typeof x === "string")) {
      throw new ConfigError(`pipeline.${task}.${k} must be an array of strings`);
    }
  }
  return out;
}

function validate(cfg: BuildGraphConfig) {
  if (!Number.isInteger(cfg.concurrency) || cfg.concurrency < 1) {
    throw new ConfigError(`concurrency must be a positive integer, got ${JSON.stringify(cfg.concurrency)}`);
  }
  if (!LOG_LEVELS.has(cfg.logLevel)) throw new ConfigError(`unknown logLevel "${cfg.logLevel}"`);
  if (!Array.isArray(cfg.globalDependencies)) throw new ConfigError(`globalDependencies must be an array`);
  if (!Array.isArray(cfg.globalEnv)) throw new ConfigError(`globalEnv must be an array`);
}

/**
 * The effective definition of `task` for one package: the root pipeline entry with the
 * package's `"buildgraph": { "pipeline": { ... } }` override merged on top.
 * Returns undefined if the task is not in the pipeline.
 */
export function resolveTaskDefinition(cfg: BuildGraphConfig, pkg: WorkspacePackage, task: string): TaskDefinition | undefined {
  const root = cfg.pipeline[task];
  if (!root) return undefined;
  const pkgPipeline = pkg.manifest.buildgraph?.pipeline;
  const override = isPlainObject(pkgPipeline) ? pkgPipeline[task] : undefined;
  if (override === undefined) return root;
  return normalizeTask(`${pkg.name}#${task}`, deepMerge(root, override));
}
