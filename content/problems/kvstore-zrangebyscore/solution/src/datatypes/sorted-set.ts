// Sorted set: member → score map plus an array kept sorted by (score, member).
// Members with equal scores are ordered lexicographically by code unit, the
// same tie-break Redis uses.
//
// Inserts are O(n) because of Array.splice. That has been fine for the sizes
// we see; a skiplist is on the roadmap.

export interface ZItem {
  member: string;
  score: number;
}

export type ZAddResult = "added" | "updated" | "unchanged";

export function compareItems(a: ZItem, b: ZItem): number {
  if (a.score !== b.score) return a.score < b.score ? -1 : 1;
  return a.member < b.member ? -1 : a.member > b.member ? 1 : 0;
}

export class SortedSet {
  private scores = new Map<string, number>();
  private items: ZItem[] = [];

  get size(): number {
    return this.items.length;
  }

  score(member: string): number | undefined {
    return this.scores.get(member);
  }

  add(member: string, score: number): ZAddResult {
    const prev = this.scores.get(member);
    if (prev === score) return "unchanged";
    if (prev !== undefined) this.items.splice(this.indexOf({ member, score: prev }), 1);
    const item = { member, score };
    this.items.splice(this.lowerBound(item), 0, item);
    this.scores.set(member, score);
    return prev === undefined ? "added" : "updated";
  }

  remove(member: string): boolean {
    const prev = this.scores.get(member);
    if (prev === undefined) return false;
    this.items.splice(this.indexOf({ member, score: prev }), 1);
    this.scores.delete(member);
    return true;
  }

  /** 0-based rank in ascending order, or undefined if not a member. */
  rank(member: string): number | undefined {
    const score = this.scores.get(member);
    if (score === undefined) return undefined;
    return this.indexOf({ member, score });
  }

  /** Items with index in [start, stop] (inclusive, already normalized). */
  range(start: number, stop: number): ZItem[] {
    return this.items.slice(start, stop + 1).map((i) => ({ ...i }));
  }

  /** Item at a sorted index (copy), or undefined when out of range. */
  at(index: number): ZItem | undefined {
    const it = this.items[index];
    return it ? { ...it } : undefined;
  }

  /** All items in order. Returns copies. */
  entries(): ZItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  /** Index of the first item >= probe in (score, member) order. */
  lowerBound(probe: ZItem): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compareItems(this.items[mid], probe) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private indexOf(item: ZItem): number {
    const i = this.lowerBound(item);
    if (i >= this.items.length || this.items[i].member !== item.member) {
      throw new Error(`SortedSet corrupted: ${item.member} not found at its score`);
    }
    return i;
  }
}
