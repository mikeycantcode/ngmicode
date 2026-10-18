import type { Direction } from "./journal";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountStatus = "open" | "closed";

export const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

/**
 * Normal balance side. Assets/expenses grow with debits; liabilities, equity
 * and revenue grow with credits. Balances are always REPORTED on the normal
 * side: a funded customer wallet (liability) has a positive balance.
 */
export const NORMAL_SIDE: Record<AccountType, Direction> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
};

/** Kinds of per-tenant, per-currency system accounts the services create on demand. */
export type SystemAccountKind = "holds" | "fees" | "fx_clearing" | "suspense";

export const SYSTEM_ACCOUNT_TYPES: Record<SystemAccountKind, AccountType> = {
  holds: "liability",
  fees: "revenue",
  fx_clearing: "asset",
  suspense: "asset",
};

export interface Account {
  id: string;
  tenantId: string;
  name: string;
  type: AccountType;
  currency: string;
  status: AccountStatus;
  /** Optional chart-of-accounts code; system accounts use "sys:<kind>:<CUR>". */
  code?: string;
  /** When false, postings may not take the normal-side balance below zero. */
  allowNegative: boolean;
  createdAt: number;
  closedAt?: number;
  metadata: Record<string, string>;
}

export function systemAccountCode(kind: SystemAccountKind, currency: string): string {
  return `sys:${kind}:${currency}`;
}

/**
 * Signed effect of a posting on an account's normal-side balance:
 * +amount when the posting is on the normal side, -amount otherwise.
 */
export function signedAmount(type: AccountType, direction: Direction, amount: number): number {
  return NORMAL_SIDE[type] === direction ? amount : -amount;
}
