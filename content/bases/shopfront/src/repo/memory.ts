import { NotFoundError } from "../shared/errors";

/**
 * Generic in-memory repository. Values are cloned on the way in and out, so
 * mutating a returned entity has no effect until you save() it again.
 * Iteration order is insertion order (Map semantics).
 */
export class InMemoryRepository<T extends { id: string }> {
  protected rows = new Map<string, T>();

  constructor(protected readonly entityName: string) {}

  get(id: string): T | undefined {
    const row = this.rows.get(id);
    return row ? deepClone(row) : undefined;
  }

  require(id: string): T {
    const row = this.get(id);
    if (!row) throw new NotFoundError(`${this.entityName} ${id} not found`);
    return row;
  }

  has(id: string): boolean {
    return this.rows.has(id);
  }

  list(): T[] {
    return [...this.rows.values()].map((r) => deepClone(r));
  }

  /**
   * Read-only iteration over stored rows WITHOUT cloning. Hot paths only
   * (search, reports) — never mutate what this yields.
   */
  *scan(): IterableIterator<Readonly<T>> {
    yield* this.rows.values();
  }

  find(predicate: (row: T) => boolean): T[] {
    const out: T[] = [];
    for (const r of this.rows.values()) if (predicate(r)) out.push(deepClone(r));
    return out;
  }

  save(entity: T): T {
    this.rows.set(entity.id, deepClone(entity));
    return entity;
  }

  delete(id: string): boolean {
    return this.rows.delete(id);
  }

  count(): number {
    return this.rows.size;
  }
}

// Repositories hand out copies so callers can't mutate stored state by accident.
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepClone(v);
  return out as T;
}
