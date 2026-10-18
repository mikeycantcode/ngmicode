// Plugin registry and hook runner.
//
// Pipeline (see Mdkit.parse):
//   preprocess(src) -> block parse -> afterBlocks(root) -> inline parse -> afterInlines(root)
// and at render time, `render` overrides are consulted per node type.

import type { Root } from "../core/ast";
import { PluginError } from "../core/errors";
import type { Env } from "../core/options";
import type { RenderOverride, RenderOverrides } from "../render/html";

export interface PluginHooks {
  /** Rewrite the source before parsing (front matter already removed). */
  preprocess?(src: string, env: Env): string;
  /** Runs after block parsing; inline `children` are still empty. */
  afterBlocks?(root: Root, env: Env): void;
  /** Runs after inline parsing; the AST is complete. */
  afterInlines?(root: Root, env: Env): void;
  /** Per-node-type HTML render overrides. */
  render?: RenderOverrides;
}

export interface Plugin {
  /** Unique name; registering two plugins with the same name is an error. */
  name: string;
  hooks: PluginHooks;
}

export class PluginHost {
  private readonly plugins: Plugin[] = [];

  add(plugin: Plugin): void {
    if (!plugin || typeof plugin.name !== "string" || !plugin.hooks) {
      throw new PluginError(String(plugin?.name ?? "?"), "invalid plugin object");
    }
    if (this.has(plugin.name)) throw new PluginError(plugin.name, "plugin registered twice");
    this.plugins.push(plugin);
  }

  has(name: string): boolean {
    return this.plugins.some((p) => p.name === name);
  }

  list(): readonly Plugin[] {
    return this.plugins;
  }

  private run<T>(plugin: Plugin, hook: string, fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof PluginError) throw e;
      throw new PluginError(plugin.name, `${hook} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  preprocess(src: string, env: Env): string {
    let out = src;
    for (const p of this.plugins) {
      const hook = p.hooks.preprocess;
      if (hook) out = this.run(p, "preprocess", () => hook(out, env));
    }
    return out;
  }

  afterBlocks(root: Root, env: Env): void {
    for (const p of this.plugins) {
      const hook = p.hooks.afterBlocks;
      if (hook) this.run(p, "afterBlocks", () => hook(root, env));
    }
  }

  afterInlines(root: Root, env: Env): void {
    for (const p of this.plugins) {
      const hook = p.hooks.afterInlines;
      if (hook) this.run(p, "afterInlines", () => hook(root, env));
    }
  }

  /**
   * Merged render overrides. When several plugins override the same node
   * type, the most recently registered one runs first and may return
   * undefined to defer to the earlier ones.
   */
  renderOverrides(): RenderOverrides {
    const merged: RenderOverrides = {};
    for (const p of this.plugins) {
      for (const [type, fn] of Object.entries(p.hooks.render ?? {}) as [keyof RenderOverrides, RenderOverride][]) {
        const prev = merged[type];
        merged[type] = prev
          ? (node, r) => {
              const res = fn(node, r);
              return res !== undefined ? res : prev(node, r);
            }
          : fn;
      }
    }
    return merged;
  }
}
