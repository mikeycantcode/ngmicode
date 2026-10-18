import type { FleetConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import { assertLatLng, type LatLng } from "../geo/latlng";
import { estimateTrip } from "../matching/eta";
import { bestCandidate } from "../matching/matcher";
import type { Clock } from "../shared/clock";
import type { Bps, Cents } from "../shared/money";
import { calculateFareLegacy } from "./legacy-fare";
import type { PromoService } from "./promos";
import type { SurgeService } from "./surge";

export interface QuoteRequest {
  riderId: string;
  pickup: LatLng;
  dropoff: LatLng;
  promoCode?: string | null;
}

export interface Quote {
  pickup: LatLng;
  dropoff: LatLng;
  estimatedDistanceMeters: number;
  estimatedDurationSec: number;
  surgeBps: Bps;
  promoCode: string | null;
  estimatedFareCents: Cents;
  /** ETA of the driver dispatch would pick right now; null if none available. */
  pickupEtaSec: number | null;
  currency: string;
  quotedAt: number;
}

export interface QuoteServiceDeps {
  registry: DriverRegistry;
  surge: SurgeService;
  promos: PromoService;
  clock: Clock;
  config: FleetConfig;
}

/** Upfront price + pickup ETA shown on the rider's confirm screen. */
export class QuoteService {
  constructor(private readonly deps: QuoteServiceDeps) {}

  quote(req: QuoteRequest): Quote {
    const pickup = assertLatLng(req.pickup, "pickup");
    const dropoff = assertLatLng(req.dropoff, "dropoff");
    const { config } = this.deps;
    const est = estimateTrip(pickup, dropoff, config.matching);
    const surgeBps = this.deps.surge.bpsAt(pickup);
    const promo = req.promoCode ? this.deps.promos.validate(req.promoCode, req.riderId) : null;

    // TODO(PRICE-212): switch to computeFare() once finance signs off on the diff.
    const estimatedFareCents = calculateFareLegacy(
      est.distanceMeters / 1000,
      est.durationSec / 60,
      surgeBps / 10_000,
      promo,
      config.pricing,
    );

    const best = bestCandidate(this.deps.registry.findAvailableNear(pickup), config.matching);

    return {
      pickup,
      dropoff,
      estimatedDistanceMeters: est.distanceMeters,
      estimatedDurationSec: est.durationSec,
      surgeBps,
      promoCode: promo ? promo.code : null,
      estimatedFareCents,
      pickupEtaSec: best ? best.etaSec : null,
      currency: config.currency,
      quotedAt: this.deps.clock.now(),
    };
  }
}
