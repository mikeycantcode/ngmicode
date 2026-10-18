// A tiny YAML subset for front matter. Supported:
//
//   key: scalar            # strings, numbers, true/false, null/~
//   key: "quoted # not a comment"
//   key: [a, b, "c, d"]    # inline lists
//   key:                   # block lists
//     - one
//     - two
//
// Not supported (and rejected with a FrontMatterError): nested maps,
// multi-line strings, anchors.

import { FrontMatterError } from "../core/errors";

export type FmScalar = string | number | boolean | null;
export type FmValue = FmScalar | FmScalar[];
export type FmData = Record<string, FmValue>;

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Removes a trailing `# comment` that is outside quotes and preceded by whitespace. */
export function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line;
}

function unquote(s: string, line: number): string {
  const q = s[0];
  if (s.length < 2 || s[s.length - 1] !== q) throw new FrontMatterError("unterminated string", line);
  const body = s.slice(1, -1);
  if (q === "'") return body.replace(/''/g, "'");
  return body.replace(/\\(["\\nt])/g, (_m, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

/** Splits the inside of `[a, "b, c"]` on top-level commas. */
function splitInlineList(body: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseScalar(raw: string, line: number): FmScalar {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s[0] === '"' || s[0] === "'") return unquote(s, line);
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function parseValue(raw: string, line: number): FmValue {
  const s = raw.trim();
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new FrontMatterError("unterminated inline list", line);
    return splitInlineList(s.slice(1, -1)).map((p) => parseScalar(p, line));
  }
  if (s.startsWith("{")) throw new FrontMatterError("nested maps are not supported", line);
  return parseScalar(s, line);
}

/**
 * Parses front matter lines.
 * @param firstLine 1-based line number of `lines[0]` (for error messages).
 */
export function parseYamlLite(lines: string[], firstLine = 1): FmData {
  const data: FmData = {};
  let listKey: string | null = null;

  lines.forEach((rawLine, idx) => {
    const lineNo = firstLine + idx;
    const line = stripComment(rawLine);
    if (!line.trim()) return;

    const item = /^\s*-\s+(.*)$/.exec(line) ?? /^\s*-$/.exec(line);
    if (item && listKey !== null) {
      const current = data[listKey];
      const arr = Array.isArray(current) ? current : [];
      arr.push(parseScalar(item[1] ?? "", lineNo));
      data[listKey] = arr;
      return;
    }

    if (/^\s/.test(line)) throw new FrontMatterError("nested maps are not supported", lineNo);

    const colon = line.indexOf(":");
    if (colon === -1) throw new FrontMatterError("expected `key: value`", lineNo);
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1);
    if (!KEY.test(key)) throw new FrontMatterError(`invalid key "${key}"`, lineNo);
    if (rest !== "" && !/^\s/.test(rest)) throw new FrontMatterError("expected a space after `:`", lineNo);

    if (rest.trim() === "") {
      data[key] = null;
      listKey = key;
    } else {
      data[key] = parseValue(rest, lineNo);
      listKey = null;
    }
  });

  return data;
}
