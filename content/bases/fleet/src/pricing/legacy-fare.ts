import type { PricingConfig } from "../config";
import { type Cents, dollarsToCents } from "../shared/money";
import type { Promo } from "./promos";

/**
 * @deprecated v1 pricing from the original monolith, ported as-is.
 * Works in float dollars. Still used for upfront prices until quotes are
 * migrated to computeFare() — see PRICE-212.
 *
 * NOTE: this matches computeFare() for all normal trips. (It does.)
 */
export function calculateFareLegacy(
  distanceKm: number,
  durationMin: number,
  surgeMultiplier: number,
  promo: Promo | null,
  pricing: PricingConfig,
): Cents {
  const base = pricing.baseFareCents / 100;
  const perKm = pricing.perKmCents / 100;
  const perMin = pricing.perMinuteCents / 100;
  const minimum = pricing.minimumFareCents / 100;
  const booking = pricing.bookingFeeCents / 100;

  let fare = base + distanceKm * perKm + durationMin * perMin;
  if (fare < minimum) fare = minimum;
  fare = fare * surgeMultiplier;

  let total = fare + booking;
  if (promo) {
    let discount = promo.kind === "percent" ? (total * promo.percentBps) / 10_000 : promo.amountCents / 100;
    if (promo.kind === "percent" && promo.maxDiscountCents !== null) {
      discount = Math.min(discount, promo.maxDiscountCents / 100);
    }
    total = Math.max(booking, total - discount);
  }
  return dollarsToCents(total);
}
