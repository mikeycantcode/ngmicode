import { DAY_MS, HOUR_MS } from "./lib/time";

export interface LedgerConfig {
  /** How long an authorization hold lives before it can no longer be captured. */
  authorizationTtlMs: number;
  /** Processing fee charged to the merchant on capture, in basis points. */
  feeBps: number;
  /** Idempotency records older than this are forgotten. */
  idempotencyTtlMs: number;
  /** Maximum page size for list endpoints. */
  maxPageSize: number;
  defaultPageSize: number;
}

export const DEFAULT_CONFIG: LedgerConfig = {
  authorizationTtlMs: 7 * DAY_MS,
  feeBps: 250, // 2.5%
  idempotencyTtlMs: 24 * HOUR_MS,
  maxPageSize: 200,
  defaultPageSize: 50,
};

// Legacy name, still imported by the old reconciliation script.
// @deprecated use DEFAULT_CONFIG.feeBps
export const PROCESSING_FEE_BPS = DEFAULT_CONFIG.feeBps;
