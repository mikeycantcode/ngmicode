import type { PricingConfig } from "../config";
import { ValidationError } from "../shared/errors";
import { applyBps, type Bps, type Cents, ONE_X_BPS, roundHalfUp } from "../shared/money";
import { computeDiscount, type Promo } from "./promos";

export interface FareInput {
  distanceMeters: number;
  durationSec: number;
  surgeBps: Bps;
  promo?: Promo | null;
  /** Waiting fee at pickup; added after minimum fare, never surged or discounted. */
  waitingCents?: Cents;
}

/**
 * Every component is integer cents. Invariants:
 *   rideCents  = baseCents + distanceCents + timeCents + surgeCents + minimumFareAdjustmentCents
 *   totalCents = rideCents + bookingFeeCents + waitingCents - discountCents
 */
export interface FareBreakdown {
  baseCents: Cents;
  distanceCents: Cents;
  timeCents: Cents;
  surgeBps: Bps;
  surgeCents: Cents;
  minimumFareAdjustmentCents: Cents;
  rideCents: Cents;
  bookingFeeCents: Cents;
  waitingCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  currency: string;
}

/**
 * The canonical fare calculation. Order matters:
 *   1. metered subtotal (base + distance + time)
 *   2. surge applies to the metered subtotal
 *   3. minimum fare is applied AFTER surge, to the ride portion
 *   4. promo discounts the ride portion only (never the booking fee)
 *   5. booking fee and waiting fee are added last, never surged, never discounted
 */
export function computeFare(input: FareInput, pricing: PricingConfig, currency = "USD"): FareBreakdown {
  if (!Number.isFinite(input.distanceMeters) || input.distanceMeters < 0) {
    throw new ValidationError("distanceMeters must be >= 0");
  }
  if (!Number.isFinite(input.durationSec) || input.durationSec < 0) {
    throw new ValidationError("durationSec must be >= 0");
  }
  if (!Number.isInteger(input.surgeBps) || input.surgeBps < ONE_X_BPS) {
    throw new ValidationError("surgeBps must be an integer >= 10000");
  }

  const baseCents = pricing.baseFareCents;
  const distanceCents = roundHalfUp((pricing.perKmCents * input.distanceMeters) / 1000);
  const timeCents = roundHalfUp((pricing.perMinuteCents * input.durationSec) / 60);
  const metered = baseCents + distanceCents + timeCents;

  const surgeCents = applyBps(metered, input.surgeBps) - metered;
  const surged = metered + surgeCents;

  const minimumFareAdjustmentCents = Math.max(0, pricing.minimumFareCents - surged);
  const rideCents = surged + minimumFareAdjustmentCents;

  const discountCents = input.promo ? computeDiscount(input.promo, rideCents) : 0;
  const bookingFeeCents = pricing.bookingFeeCents;
  const waitingCents = input.waitingCents ?? 0;
  if (!Number.isInteger(waitingCents) || waitingCents < 0) throw new ValidationError("waitingCents must be a non-negative integer");
  const totalCents = rideCents + bookingFeeCents + waitingCents - discountCents;

  return {
    baseCents,
    distanceCents,
    timeCents,
    surgeBps: input.surgeBps,
    surgeCents,
    minimumFareAdjustmentCents,
    rideCents,
    bookingFeeCents,
    waitingCents,
    discountCents,
    totalCents,
    currency,
  };
}
