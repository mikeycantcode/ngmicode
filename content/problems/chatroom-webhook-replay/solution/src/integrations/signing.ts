import { hmacHex, timingSafeEqual } from "../util/hash";

// Payload signing for webhooks (both directions).
//
// v2: x-steer-timestamp: <unix seconds>
//     x-steer-signature: v2=<hmacHex(secret, "v2:" + timestamp + ":" + rawBody)>
//
// The timestamp is inside the signed string, so it can't be swapped, and
// receivers reject requests outside the tolerance window. v1 (unsigned
// timestamp, replayable) is retired.

export const SIGNATURE_HEADER = "x-steer-signature";
export const TIMESTAMP_HEADER = "x-steer-timestamp";

export function signV2(secret: string, timestampSec: number | string, body: string): string {
  return `v2=${hmacHex(secret, `v2:${timestampSec}:${body}`)}`;
}

/** Parses a decimal-integer seconds timestamp; null if missing/malformed. */
export function parseTimestamp(header: string | undefined): number | null {
  if (!header || !/^\d{1,12}$/.test(header)) return null;
  return Number(header);
}

export function verifyV2(secret: string, timestampHeader: string, body: string, signature: string | undefined): boolean {
  if (!signature || !signature.startsWith("v2=")) return false;
  return timingSafeEqual(signature, signV2(secret, timestampHeader, body));
}

/** Headers for an outgoing signed request at `nowMs`. */
export function signedHeaders(secret: string, body: string, nowMs: number): Record<string, string> {
  const ts = String(Math.floor(nowMs / 1000));
  return { [TIMESTAMP_HEADER]: ts, [SIGNATURE_HEADER]: signV2(secret, ts, body) };
}

/** Case-insensitive header lookup. */
export function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v;
  return undefined;
}
