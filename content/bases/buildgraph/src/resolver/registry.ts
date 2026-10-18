import { hashString } from "../utils/hash";
import { valid } from "../semver/parse";
import { sortVersions } from "../semver/compare";

export interface RegistryVersion {
  version: string;
  dependencies: Record<string, string>;
  integrity: string;
}

/**
 * Read-only package registry. The real implementation talks to an npm-compatible
 * HTTP registry; everything in-repo uses InMemoryRegistry.
 */
export interface Registry {
  /** All published versions of `name` (ascending), or undefined if the package doesn't exist. */
  versions(name: string): RegistryVersion[] | undefined;
}

export type RegistryData = Record<string, Record<string, { dependencies?: Record<string, string>; integrity?: string }>>;

export class InMemoryRegistry implements Registry {
  private data = new Map<string, RegistryVersion[]>();

  constructor(data: RegistryData = {}) {
    for (const [name, versions] of Object.entries(data)) {
      for (const [v, meta] of Object.entries(versions)) this.publish(name, v, meta.dependencies ?? {}, meta.integrity);
    }
  }

  publish(name: string, version: string, dependencies: Record<string, string> = {}, integrity?: string): void {
    const v = valid(version);
    if (!v) throw new Error(`InMemoryRegistry: invalid version ${version} for ${name}`);
    const list = this.data.get(name) ?? [];
    if (list.some((x) => x.version === v)) throw new Error(`InMemoryRegistry: ${name}@${v} already published`);
    list.push({ version: v, dependencies, integrity: integrity ?? defaultIntegrity(name, v) });
    const order = sortVersions(list.map((x) => x.version));
    list.sort((a, b) => order.indexOf(a.version) - order.indexOf(b.version));
    this.data.set(name, list);
  }

  versions(name: string): RegistryVersion[] | undefined {
    return this.data.get(name);
  }
}

export function defaultIntegrity(name: string, version: string): string {
  return `fnv64-${hashString(`${name}@${version}`)}`;
}
