import { MemoryFS } from "../src/vfs/vfs";
import { InMemoryRegistry } from "../src/resolver/registry";

const json = (x: unknown) => JSON.stringify(x, null, 2);

/**
 * The "acme" sample monorepo used across tests:
 *
 *   apps/web      @acme/web     -> @acme/ui, @acme/utils
 *   apps/docs     @acme/docs    -> @acme/ui-kit
 *   packages/ui-kit @acme/ui-kit -> @acme/ui
 *   packages/ui   @acme/ui      -> @acme/utils
 *   packages/utils @acme/utils
 */
export function sampleFiles(): Record<string, string> {
  return {
    "package.json": json({ name: "acme", private: true, workspaces: ["packages/*", "apps/*"] }),
    "buildgraph.json": json({
      pipeline: {
        build: { dependsOn: ["^build"], outputs: ["dist/**"] },
        test: { dependsOn: ["build"] },
        lint: {},
      },
    }),
    "README.md": "# acme monorepo\n",
    "packages/utils/package.json": json({
      name: "@acme/utils",
      version: "1.4.0",
      dependencies: { lodash: "^4.17.0" },
      scripts: { build: "compile src dist", test: "sleep 20 && echo utils: 12 passed", lint: "echo lint ok" },
    }),
    "packages/utils/src/index.ts": "export * from './math';\n",
    "packages/utils/src/math.ts": "export const add = (a: number, b: number) => a + b;\n",
    "packages/ui/package.json": json({
      name: "@acme/ui",
      version: "2.1.0",
      dependencies: { "@acme/utils": "workspace:*", react: "^18.2.0" },
      scripts: { build: "compile src dist && sleep 30", test: "sleep 40 && echo ui: 30 passed", lint: "echo lint ok" },
    }),
    "packages/ui/src/button.ts": "export const Button = () => 'button';\n",
    "packages/ui-kit/package.json": json({
      name: "@acme/ui-kit",
      version: "0.3.0",
      dependencies: { "@acme/ui": "^2.0.0" },
      scripts: { build: "compile src dist" },
    }),
    "packages/ui-kit/src/index.ts": "export { Button } from '@acme/ui';\n",
    "apps/web/package.json": json({
      name: "@acme/web",
      version: "0.0.1",
      private: true,
      dependencies: { "@acme/ui": "workspace:^", "@acme/utils": "workspace:*", react: "^18.0.0" },
      scripts: { build: "compile src dist && sleep 50", test: "sleep 25 && echo web: 8 passed", lint: "echo lint ok" },
      buildgraph: { pipeline: { build: { env: ["API_URL"] } } },
    }),
    "apps/web/src/main.ts": "console.log('web');\n",
    "apps/docs/package.json": json({
      name: "@acme/docs",
      version: "0.0.1",
      private: true,
      dependencies: { "@acme/ui-kit": "workspace:*" },
      devDependencies: { lodash: "~4.17.20" },
      scripts: { build: "compile src dist && sleep 10" },
    }),
    "apps/docs/src/index.ts": "export const docs = true;\n",
  };
}

export function sampleRepo(overrides: Record<string, string> = {}): MemoryFS {
  return new MemoryFS({ ...sampleFiles(), ...overrides });
}

export function sampleRegistry(): InMemoryRegistry {
  return new InMemoryRegistry({
    lodash: { "4.17.19": {}, "4.17.20": {}, "4.17.21": {}, "5.0.0-beta.1": {} },
    react: {
      "17.0.2": { dependencies: { "loose-envify": "^1.1.0" } },
      "18.2.0": { dependencies: { "loose-envify": "^1.1.0" } },
      "18.3.1": { dependencies: { "loose-envify": "^1.1.0" } },
      "19.0.0-rc.1": { dependencies: {} },
    },
    "loose-envify": { "1.3.1": { dependencies: { "js-tokens": "^3.0.0 || ^4.0.0" } }, "1.4.0": { dependencies: { "js-tokens": "^3.0.0 || ^4.0.0" } } },
    "js-tokens": { "3.0.2": {}, "4.0.0": {} },
  });
}
