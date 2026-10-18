// WAL entry encoding. Each entry is one command in a RESP-like array form:
//
//   *<argc>\r\n  then for each arg:  $<len>\r\n<arg>\r\n
//
// <len> counts UTF-16 code units (the WAL lives in a JS string array, so
// there are no bytes involved). Entries are self-delimiting, so the "file" is
// simply entries.join("").

import { CorruptLogError } from "../errors";

export function encodeCommand(argv: string[]): string {
  let out = `*${argv.length}\r\n`;
  for (const arg of argv) out += `$${arg.length}\r\n${arg}\r\n`;
  return out;
}

/**
 * Decodes one entry. Throws CorruptLogError (with index = `entryIndex`) if the
 * entry is malformed or has trailing data.
 */
export function decodeCommand(entry: string, entryIndex = 0): string[] {
  let pos = 0;
  const fail = (why: string): never => {
    throw new CorruptLogError(`corrupt WAL entry #${entryIndex}: ${why}`, entryIndex);
  };
  const readLine = (): string => {
    const end = entry.indexOf("\r\n", pos);
    if (end === -1) fail("missing CRLF");
    const line = entry.slice(pos, end);
    pos = end + 2;
    return line;
  };

  const header = readLine();
  if (header[0] !== "*") fail("expected '*'");
  const argc = Number(header.slice(1));
  if (!Number.isInteger(argc) || argc < 1) fail(`bad argc '${header.slice(1)}'`);

  const argv: string[] = [];
  for (let i = 0; i < argc; i++) {
    const lenLine = readLine();
    if (lenLine[0] !== "$") fail("expected '$'");
    const len = Number(lenLine.slice(1));
    if (!Number.isInteger(len) || len < 0) fail(`bad length '${lenLine.slice(1)}'`);
    if (pos + len + 2 > entry.length) fail("truncated argument");
    argv.push(entry.slice(pos, pos + len));
    pos += len;
    if (entry.slice(pos, pos + 2) !== "\r\n") fail("argument not terminated by CRLF");
    pos += 2;
  }
  if (pos !== entry.length) fail("trailing data");
  return argv;
}
