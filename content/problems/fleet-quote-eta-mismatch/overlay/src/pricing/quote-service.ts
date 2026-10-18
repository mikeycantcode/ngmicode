import type { FleetConfig } from "../config";
import type { DriverRegistry } from "../drivers/driver-registry";
import { haversineKm } from "../geo/haversine";
import { assertLatLng, type LatLng } from "../geo/latlng";
import { estimateTrip } from "../matching/eta";
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

/** Average city driving speed used for the "car is N min away" badge. */
const AVG_CITY_SPEED_KMH = 30;

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

    const pickupEtaSec = this.nearestCarEtaSec(pickup);

    return {
      pickup,
      dropoff,
      estimatedDistanceMeters: est.distanceMeters,
      estimatedDurationSec: est.durationSec,
      surgeBps,
      promoCode: promo ? promo.code : null,
      estimatedFareCents,
      pickupEtaSec,
      currency: config.currency,
      quotedAt: this.deps.clock.now(),
    };
  }

  /**
   * ETA of the closest online car. The confirm screen is latency-sensitive,
   * so this skips the full dispatch ranking and just finds the nearest car.
   */
  private nearestCarEtaSec(pickup: LatLng): number | null {
    let best: number | null = null;
    for (const d of this.deps.registry.list()) {
      if (!d.location || d.status === "offline") continue;
      const km = haversineKm(pickup, d.location);
      if (km > this.deps.config.matching.searchRadiusKm) continue;
      const eta = Math.round((km / AVG_CITY_SPEED_KMH) * 3600);
      if (best === null || eta < best) best = eta;
    }
    return best;
  }
}
