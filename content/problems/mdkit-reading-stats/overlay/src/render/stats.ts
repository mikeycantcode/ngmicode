// Reading statistics for the docs site ("5 min read").

import type { Root } from "../core/ast";

export interface ReadingStats {
  words: number;
  minutes: number;
}

export interface StatsOptions {
  /** Default 200. */
  wordsPerMinute?: number;
  /** Count words inside fenced code blocks. Default false. */
  includeCode?: boolean;
}

export function readingStats(root: Root, opts: StatsOptions = {}): ReadingStats {
  // TODO: implement
  throw new Error("readingStats: not implemented");
}
