// Reading statistics for the docs site ("5 min read").

import type { Root } from "../core/ast";
import { toText, walk } from "../core/ast";

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

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

export function readingStats(root: Root, opts: StatsOptions = {}): ReadingStats {
  const wpm = opts.wordsPerMinute ?? 200;
  if (!Number.isInteger(wpm) || wpm <= 0) throw new RangeError("wordsPerMinute must be a positive integer");

  // One chunk per text-bearing block so words never merge across blocks.
  const chunks: string[] = [];
  walk(root, (node) => {
    switch (node.type) {
      case "heading":
      case "paragraph":
      case "tableCell":
        chunks.push(toText(node));
        return "skip";
      case "code":
        if (opts.includeCode) chunks.push(node.value);
        return "skip";
      case "html":
        return "skip";
    }
  });

  const words = chunks
    .join("\n")
    .split(/\s+/)
    .filter((t) => HAS_WORD_CHAR.test(t)).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wpm));
  return { words, minutes };
}
