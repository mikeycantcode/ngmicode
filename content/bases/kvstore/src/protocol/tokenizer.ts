// Splits an inline command line into argv, redis-cli style:
//
//   SET greeting "hello world"       → ["SET", "greeting", "hello world"]
//   SET k "tab\there"                → escape sequences in double quotes: \n \r \t \b \a \" \\ \xHH
//   SET k 'it''s'                    → NOT supported; single quotes only escape \'
//
// A closing quote must be followed by whitespace or end of line.

import { KvError } from "../errors";

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", a: "\x07", '"': '"', "\\": "\\" };

function protocolError(): KvError {
  return new KvError("ERR Protocol error: unbalanced quotes in request");
}

export function tokenize(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    while (i < n && /\s/.test(line[i])) i++;
    if (i >= n) break;

    let token = "";
    if (line[i] === '"') {
      i++;
      let closed = false;
      while (i < n) {
        const c = line[i];
        if (c === "\\" && i + 1 < n) {
          const next = line[i + 1];
          if (next === "x" && /^[0-9a-fA-F]{2}$/.test(line.slice(i + 2, i + 4))) {
            token += String.fromCharCode(parseInt(line.slice(i + 2, i + 4), 16));
            i += 4;
          } else {
            token += ESCAPES[next] ?? next;
            i += 2;
          }
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          token += c;
          i++;
        }
      }
      if (!closed || (i < n && !/\s/.test(line[i]))) throw protocolError();
    } else if (line[i] === "'") {
      i++;
      let closed = false;
      while (i < n) {
        const c = line[i];
        if (c === "\\" && line[i + 1] === "'") {
          token += "'";
          i += 2;
        } else if (c === "'") {
          closed = true;
          i++;
          break;
        } else {
          token += c;
          i++;
        }
      }
      if (!closed || (i < n && !/\s/.test(line[i]))) throw protocolError();
    } else {
      while (i < n && !/\s/.test(line[i])) token += line[i++];
    }
    out.push(token);
  }
  return out;
}
