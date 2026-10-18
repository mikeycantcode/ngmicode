import { ConflictError, NotFoundError } from "../domain/errors";
import { deepClone } from "../lib/objects";

/**
 * Generic in-memory table keyed by `id`. Rows are deep-copied on the way in
 * and out so callers can never mutate stored state by accident — always go
 * through update().
 */
export class InMemoryTable<T extends { id: string }> {
  private rows = new Map<string, T>();

  constructor(private readonly entity: string) {}

  insert(row: T): T {
    if (this.rows.has(row.id)) throw new ConflictError(`${this.entity} ${row.id} already exists`);
    this.rows.set(row.id, deepClone(row));
    return deepClone(row);
  }

  get(id: string): T | undefined {
    const row = this.rows.get(id);
    return row ? deepClone(row) : undefined;
  }

  require(id: string): T {
    const row = this.get(id);
    if (!row) throw new NotFoundError(this.entity, id);
    return row;
  }

  update(id: string, patch: Partial<T>): T {
    const cur = this.rows.get(id);
    if (!cur) throw new NotFoundError(this.entity, id);
    const next = { ...cur, ...deepClone(patch), id } as T;
    this.rows.set(id, next);
    return deepClone(next);
  }

  delete(id: string): boolean {
    return this.rows.delete(id);
  }

  list(filter?: (row: T) => boolean): T[] {
    const out: T[] = [];
    for (const row of this.rows.values()) if (!filter || filter(row)) out.push(deepClone(row));
    return out;
  }

  size(): number {
    return this.rows.size;
  }
}
