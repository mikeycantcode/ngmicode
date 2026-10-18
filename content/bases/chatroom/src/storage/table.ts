// Minimal in-memory table. Rows are stored by key and handed out as shallow
// copies so callers can't mutate storage by accident — always write back with
// update()/put().

export class Table<T extends object> {
  private rows = new Map<string, T>();
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  get size(): number {
    return this.rows.size;
  }

  get(key: string): T | undefined {
    const row = this.rows.get(key);
    return row ? clone(row) : undefined;
  }

  has(key: string): boolean {
    return this.rows.has(key);
  }

  insert(key: string, row: T): T {
    if (this.rows.has(key)) throw new Error(`${this.name}: duplicate key ${key}`);
    this.rows.set(key, clone(row));
    return clone(row);
  }

  put(key: string, row: T): T {
    this.rows.set(key, clone(row));
    return clone(row);
  }

  update(key: string, patch: Partial<T>): T {
    const cur = this.rows.get(key);
    if (!cur) throw new Error(`${this.name}: missing key ${key}`);
    const next = { ...cur, ...patch };
    this.rows.set(key, clone(next));
    return clone(next);
  }

  delete(key: string): boolean {
    return this.rows.delete(key);
  }

  all(): T[] {
    return [...this.rows.values()].map(clone);
  }

  filter(pred: (row: T) => boolean): T[] {
    const out: T[] = [];
    for (const row of this.rows.values()) if (pred(row)) out.push(clone(row));
    return out;
  }

  find(pred: (row: T) => boolean): T | undefined {
    for (const row of this.rows.values()) if (pred(row)) return clone(row);
    return undefined;
  }
}

function clone<T>(row: T): T {
  // Shallow copy plus one level for arrays/objects we know rows contain
  // (reactions map, mentions list). Deep enough for our row shapes.
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === "object") {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) inner[ik] = Array.isArray(iv) ? iv.slice() : iv;
      out[k] = inner;
    }
  }
  return out as T;
}
