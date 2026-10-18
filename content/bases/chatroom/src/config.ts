import { HOUR, MINUTE, SECOND } from "./util/clock";

export interface BucketConfig {
  capacity: number;
  refillPerSecond: number;
}

export interface ChatConfig {
  messages: { maxLength: number };
  history: { defaultLimit: number; maxLimit: number };
  presence: { awayAfterMs: number };
  typing: { ttlMs: number; throttleMs: number };
  notifications: { previewLength: number };
  search: { maxResults: number };
  delivery: { maxQueue: number };
  rateLimits: Record<string, BucketConfig>;
  webhooks: { maxAttempts: number; retryBaseMs: number; signatureToleranceMs: number };
}

export const DEFAULT_CONFIG: ChatConfig = {
  messages: { maxLength: 4000 },
  history: { defaultLimit: 50, maxLimit: 200 },
  presence: { awayAfterMs: 10 * MINUTE },
  typing: { ttlMs: 6 * SECOND, throttleMs: 3 * SECOND },
  notifications: { previewLength: 80 },
  search: { maxResults: 50 },
  // NOTE: not enforced yet — queues are unbounded (see delivery/outboundQueue).
  delivery: { maxQueue: 100 },
  rateLimits: {
    default: { capacity: 50, refillPerSecond: 10 },
    "chat.write": { capacity: 10, refillPerSecond: 1 },
    "search": { capacity: 5, refillPerSecond: 0.5 },
  },
  // signatureToleranceMs is reserved for the v2 signing scheme (CHAT-341).
  webhooks: { maxAttempts: 4, retryBaseMs: 2 * SECOND, signatureToleranceMs: 5 * MINUTE },
};

export function mergeConfig(overrides: DeepPartial<ChatConfig> = {}): ChatConfig {
  const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ChatConfig;
  for (const [section, value] of Object.entries(overrides)) {
    const target = (out as unknown as Record<string, Record<string, unknown>>)[section];
    Object.assign(target, value);
  }
  return out;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

/** @deprecated old name, pre-workspaces. */
export const LEGACY_SESSION_TTL_MS = 12 * HOUR;
