import { hmacHex } from "../util/hash";

// Payload signing for webhooks (both directions).
//
// v1 (current): x-steer-signature: v1=<hmacHex(secret, rawBody)>
//
// v1 has no timestamp, so a captured request can be replayed forever.
// CHAT-341 tracks the move to a timestamped scheme.

export const SIGNATURE_HEADER = "x-steer-signature";
export const TIMESTAMP_HEADER = "x-steer-timestamp";

export function signV1(secret: string, body: string): string {
  return `v1=${hmacHex(secret, body)}`;
}

export function verifyV1(secret: string, body: string, header: string | undefined): boolean {
  if (!header) return false;
  return header === signV1(secret, body);
}

/** Case-insensitive header lookup. */
export function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v;
  return undefined;
}
