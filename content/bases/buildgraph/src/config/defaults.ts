import type { BuildGraphConfig, TaskDefinition } from "./types";

export const CONFIG_FILE = "buildgraph.json";

export const DEFAULT_TASK: TaskDefinition = {
  dependsOn: [],
  inputs: ["**"],
  outputs: [],
  env: [],
  cache: true,
};

export const DEFAULT_CONFIG: BuildGraphConfig = {
  pipeline: {
    build: { ...DEFAULT_TASK, dependsOn: ["^build"], outputs: ["dist/**"] },
    test: { ...DEFAULT_TASK, dependsOn: ["build"] },
  },
  concurrency: 4,
  globalDependencies: ["buildgraph.json", "package.json"],
  globalEnv: [],
  cacheDir: ".buildgraph/cache",
  logLevel: "info",
};

// TODO(platform): concurrency should default to the number of CPUs once we can
// read it from the host; 4 matches the CI runners for now.
