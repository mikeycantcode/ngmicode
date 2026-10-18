// Channel pattern matching for PSUBSCRIBE. Delegates to the shared glob
// matcher so KEYS, SCAN MATCH and PSUBSCRIBE agree on syntax.

import { globMatch } from "../util/glob";

export function patternMatch(pattern: string, channel: string): boolean {
  return globMatch(pattern, channel);
}
