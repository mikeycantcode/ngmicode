// Strict number parsing/formatting shared by all commands.

import { NotFloatError, NotIntegerError } from "../errors";

const INT_RE = /^-?(0|[1-9]\d*)$/;

/** Parses a base-10 integer argument. No "+", no whitespace, no leading zeros. */
export function parseInteger(s: string): number {
  if (!INT_RE.test(s)) throw new NotIntegerError();
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new NotIntegerError();
  return n;
}

const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Parses a float argument. Accepts inf / +inf / -inf (any case). Rejects NaN. */
export function parseFloatStrict(s: string): number {
  const lower = s.toLowerCase();
  if (lower === "inf" || lower === "+inf" || lower === "infinity" || lower === "+infinity") return Infinity;
  if (lower === "-inf" || lower === "-infinity") return -Infinity;
  if (!FLOAT_RE.test(s)) throw new NotFloatError();
  const n = Number(s);
  if (Number.isNaN(n)) throw new NotFloatError();
  return n;
}

/**
 * Formats a double the way replies and the WAL expect: "inf"/"-inf",
 * integers without a decimal point, otherwise the shortest round-trip form.
 */
export function formatDouble(n: number): string {
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Object.is(n, -0)) return "0";
  return String(n);
}

/**
 * Normalizes an inclusive [start, stop] index pair against a length, with
 * negative indexes counting from the end (LRANGE / ZRANGE semantics).
 * Returns null when the range is empty.
 */
export function normalizeRange(start: number, stop: number, length: number): [number, number] | null {
  if (start < 0) start = length + start;
  if (stop < 0) stop = length + stop;
  if (start < 0) start = 0;
  if (stop >= length) stop = length - 1;
  if (start > stop || start >= length) return null;
  return [start, stop];
}
