// Legacy float-dollar helpers from the v1 storefront (PHP port).
// Still referenced by the CSV import path; do not use in new code.

/** @deprecated amounts are integer cents everywhere — use shared/money.ts */
export function toDollars(cents: number): number {
  return cents / 100;
}

/** @deprecated amounts are integer cents everywhere — use shared/money.ts */
export function dollarsToCents(dollars: number): number {
  // NOTE: Math.round(19.99 * 100) is fine, but 1.005 * 100 = 100.49999 — known issue.
  return Math.round(dollars * 100);
}

/** @deprecated use formatCents */
export function formatDollars(dollars: number): string {
  return "$" + dollars.toFixed(2);
}
