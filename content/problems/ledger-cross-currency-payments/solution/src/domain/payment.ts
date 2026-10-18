/**
 * Card-style payment from a customer wallet to a merchant.
 *
 *   authorized ──capture──▶ captured ──refund──▶ partially_refunded ──refund──▶ refunded
 *       │                       └──────────refund (full)─────────────────────────▲
 *       ├──void──▶ voided
 *       └──(ttl passes)──▶ expired
 */
export type PaymentStatus = "authorized" | "captured" | "partially_refunded" | "refunded" | "voided" | "expired";

export const TERMINAL_STATUSES: PaymentStatus[] = ["refunded", "voided", "expired"];

export interface Refund {
  id: string;
  amount: number;
  at: number;
  entryId: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  customerAccountId: string;
  merchantAccountId: string;
  /** Authorized amount, minor units of `currency`. */
  amount: number;
  currency: string;
  capturedAmount: number;
  refundedAmount: number;
  /** Fee in settlement currency minor units. */
  feeAmount: number;
  /** Merchant's currency. Equals `currency` for same-currency payments. */
  settlementCurrency: string;
  /** Captured amount converted at the capture-time rate (set on capture). */
  settlementAmount?: number;
  /** Settlement amount already returned via refunds. */
  settlementRefunded: number;
  status: PaymentStatus;
  authorizedAt: number;
  expiresAt: number;
  capturedAt?: number;
  voidedAt?: number;
  expiredAt?: number;
  reference?: string;
  /** Journal entries created for this payment, in order. */
  entryIds: string[];
  refunds: Refund[];
}

export function isTerminal(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
