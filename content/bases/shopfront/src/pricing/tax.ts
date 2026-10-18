import { bpsOf } from "../shared/money";
import { ValidationError } from "../shared/errors";

/** Sales tax / VAT in basis points by region code. */
export const TAX_RATES_BPS: Record<string, number> = {
  "US-CA": 725,
  "US-NY": 400,
  "US-OR": 0,
  "US-TX": 625,
  "US-AK": 0,
  "US-HI": 400,
  "EU-DE": 1900,
  "EU-FR": 2000,
};

export function isKnownRegion(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(TAX_RATES_BPS, region);
}

/**
 * Tax on the goods net (after all discounts). Shipping is not taxed.
 * TODO(#412): EU requires VAT on shipping as well.
 */
export function taxFor(region: string, taxableCents: number): number {
  const bps = TAX_RATES_BPS[region];
  if (bps === undefined) throw new ValidationError(`unsupported region ${region}`);
  return bpsOf(taxableCents, bps);
}
