// WAL entry encoding.
//
// v2 (current) entries are framed:  "#2 <crc32 hex of payload> <payload>"
// v1 (legacy) entries are the bare payload. Both decode with decodeCommand.
//
// The payload is one command in a RESP-like array form:
//
//   *<argc>\r\n  then for each arg:  $<len>\r\n<arg>\r\n
//
// <len> counts UTF-16 code units (the WAL lives in a JS string array, so
// there are no bytes involved). Entries are self-delimiting, so the "file" is
// simply entries.join("").

import { CorruptLogError } from "../errors";
import { crc32Hex } from "../util/checksum";

export const FRAME_PREFIX = "#2 ";
const FRAME_RE = /^#2 ([0-9a-f]{8}) /;

/** Encodes a command as a v2 (checksummed) WAL entry. */
export function encodeEntry(argv: string[]): string {
  const payload = encodeCommand(argv);
  return `${FRAME_PREFIX}${crc32Hex(payload)} ${payload}`;
}

export function isFramed(entry: string): boolean {
  return entry.startsWith(FRAME_PREFIX);
}

export function encodeCommand(argv: string[]): string {
  let out = `*${argv.length}\r\n`;
  for (const arg of argv) out += `$${arg.length}\r\n${arg}\r\n`;
  return out;
}

/**
 * Decodes one WAL entry, v2 (framed) or v1 (bare payload). Throws
 * CorruptLogError (with index = `entryIndex`) if the frame or checksum is
 * bad, or the payload is malformed or has trailing data.
 */
export function decodeCommand(entry: string, entryIndex = 0): string[] {
  if (isFramed(entry)) {
    const m = FRAME_RE.exec(entry);
    if (!m) throw new CorruptLogError(`corrupt WAL entry #${entryIndex}: bad frame header`, entryIndex);
    const payload = entry.slice(m[0].length);
    if (crc32Hex(payload) !== m[1]) throw new CorruptLogError(`corrupt WAL entry #${entryIndex}: checksum mismatch`, entryIndex);
    return decodePayload(payload, entryIndex);
  }
  return decodePayload(entry, entryIndex);
}

function decodePayload(entry: string, entryIndex: number): string[] {
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
