/**
 * Array-backed binary min-heap. `compare(a, b) < 0` means `a` comes out first.
 */
export class BinaryHeap<T> {
  private items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** Remove the first item matching `pred`. O(n). */
  remove(pred: (item: T) => boolean): boolean {
    const i = this.items.findIndex(pred);
    if (i === -1) return false;
    const last = this.items.pop()!;
    if (i < this.items.length) {
      this.items[i] = last;
      this.siftDown(i);
      this.siftUp(i);
    }
    return true;
  }

  /** Sorted copy (does not mutate the heap). */
  toArray(): T[] {
    return [...this.items].sort(this.compare);
  }

  clear(): void {
    this.items = [];
  }

  private siftUp(i: number): void {
    const items = this.items;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i], items[parent]) >= 0) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const items = this.items;
    const n = items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.compare(items[left], items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(items[right], items[smallest]) < 0) smallest = right;
      if (smallest === i) return;
      [items[i], items[smallest]] = [items[smallest], items[i]];
      i = smallest;
    }
  }
}
