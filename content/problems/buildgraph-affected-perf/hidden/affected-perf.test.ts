import { it, expect } from "testkit";
import { findAffected } from "../../src/affected/affected";
import { buildPackageGraph } from "../../src/workspace/package-graph";
import { loadWorkspace } from "../../src/workspace/workspace";
import { MemoryFS } from "../../src/vfs/vfs";
import { sampleRepo } from "../fixtures";

// 1,500 packages in 30 layers of 50; each package depends on 3 packages of the previous layer.
function bigRepo() {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "big", private: true, workspaces: ["libs/*"] }),
  };
  const L = 30, W = 50;
  const name = (l: number, i: number) => `@big/l${l}-p${i}`;
  for (let l = 0; l < L; l++) {
    for (let i = 0; i < W; i++) {
      const deps: Record<string, string> = {};
      if (l > 0) for (const k of [i, (i + 7) % W, (i + 19) % W]) deps[name(l - 1, k)] = "workspace:*";
      files[`libs/l${l}-p${i}/package.json`] = JSON.stringify({ name: name(l, i), version: "1.0.0", dependencies: deps });
    }
  }
  return { fs: new MemoryFS(files), name };
}

it("handles a large monorepo and a large change set quickly", () => {
  const { fs, name } = bigRepo();
  const ws = loadWorkspace(fs);
  const pg = buildPackageGraph(ws);
  const changed: string[] = [];
  for (let i = 0; i < 6000; i++) changed.push(`libs/l29-p${i % 50}/src/deep/dir/file${i}.ts`);
  changed.push("libs/l1-p3/src/index.ts", "docs/README.md");
  const t0 = Date.now();
  const r = findAffected(ws, pg, changed, { globalDependencies: ["package.json"] });
  const ms = Date.now() - t0;
  expect(r.changedPackages).toContain(name(1, 3));
  expect(r.changedPackages).toHaveLength(51);
  expect(r.affected.length).toBeGreaterThan(1000);
  expect(r.affected).toContain(name(29, 0));
  expect(r.affected).not.toContain(name(0, 3));
  expect(r.reasons[name(2, 3)]).toBe(`depends on ${name(1, 3)}`);
  expect(ms).toBeLessThan(100);
});

it("keeps ownership semantics: longest prefix, sibling prefixes, root files, globals", () => {
  const fs = sampleRepo({
    "packages/workspace.json": "{}",
    "packages/ui/plugins/charts/package.json": JSON.stringify({ name: "@acme/ui-charts", version: "1.0.0", dependencies: { "@acme/ui": "workspace:*" } }),
    "package.json": JSON.stringify({ name: "acme", private: true, workspaces: ["packages/*", "apps/*", "packages/ui/plugins/*"] }),
  });
  const ws = loadWorkspace(fs);
  const pg = buildPackageGraph(ws);
  const opts = { globalDependencies: ["buildgraph.json", "package.json"] };
  const a = findAffected(ws, pg, ["packages/ui/plugins/charts/src/bar.ts", "packages/ui-kit/src/index.ts", "packages/workspace.json", "README.md"], opts);
  expect(a.changedPackages).toEqual(["@acme/ui-charts", "@acme/ui-kit"]);
  expect(a.affected).toEqual(["@acme/docs", "@acme/ui-charts", "@acme/ui-kit"]);
  expect(a.reasons["@acme/docs"]).toBe("depends on @acme/ui-kit");
  const g = findAffected(ws, pg, ["apps/web/src/main.ts", "package.json"], opts);
  expect(g.global).toBe(true);
  expect(g.affected).toHaveLength(6);
  expect(g.changedPackages).toEqual(["@acme/web"]);
});
