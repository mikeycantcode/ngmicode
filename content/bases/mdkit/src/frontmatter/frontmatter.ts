// Front matter: a `---` fenced block of YAML-lite at the very top of a file.
//
//   ---
//   title: Release notes
//   tags: [changelog]
//   ---
//   # Body starts here

import { normalizeNewlines } from "../util/strings";
import { type FmData, parseYamlLite } from "./yamlLite";

export interface FrontMatter {
  data: FmData;
  /** The document with the front matter removed. */
  body: string;
  /**
   * Number of source lines consumed by the front matter, fences included.
   * The body's first line is line `lineCount + 1` of the original file.
   */
  lineCount: number;
  /** Raw YAML between the fences, or null when there was no front matter. */
  raw: string | null;
}

const OPEN = /^---[ \t]*$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;

export function extractFrontMatter(src: string): FrontMatter {
  const text = normalizeNewlines(src);
  const none: FrontMatter = { data: {}, body: text, lineCount: 0, raw: null };
  const lines = text.split("\n");
  if (!OPEN.test(lines[0] ?? "")) return none;

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (CLOSE.test(lines[i])) {
      end = i;
      break;
    }
  }
  // No closing fence: it was a thematic break, not front matter.
  if (end === -1) return none;

  const yaml = lines.slice(1, end);
  return {
    data: parseYamlLite(yaml, 2),
    body: lines.slice(end + 1).join("\n"),
    lineCount: end + 1,
    raw: yaml.join("\n"),
  };
}

/** Convenience accessor: a string value, or undefined if missing / not a string. */
export function fmString(data: FmData, key: string): string | undefined {
  const v = data[key];
  return typeof v === "string" ? v : undefined;
}
